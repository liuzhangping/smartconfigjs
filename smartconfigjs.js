'use strict'

const {GUIDE_CODES, toDatumCode, toPackets} = require('./esptouch')
const dgram = require('dgram')

const ListeningPort = 18266
const TargetPort = 7001

async function execute(apSsid, apBssid, apPassword, ipAddress, isSsidHidden) {
  const TimeoutGuideCodeMillisecond = 2000
  const TimeoutDataCodeMillisecond = 4000
  const TimeoutTotalCodeMillisecond = TimeoutGuideCodeMillisecond + TimeoutDataCodeMillisecond
  const IntervalGuideCodeMillisecond = 8
  const IntervalDataCodeMillisecond = 8
  const WaitUdpSendingMillisecond = 45000

  const gcPackets = toPackets(GUIDE_CODES)
  const dcPackets = toPackets(toDatumCode(apSsid, apBssid, apPassword, ipAddress, isSsidHidden))

  const startTime = Date.now()
  let currentTime = startTime
  let lastTime = currentTime - TimeoutTotalCodeMillisecond

  const ExpectOneByte = Buffer.from(apSsid + (apPassword + '')).length + 9
  const res = {
    acked: false
  }

  let index = 0
 
  const sock = dgram.createSocket('udp4')
  sock.on('error', (err) => {
    console.error(err)
    res.err = err
  })

  sock.on('message', (msg, rinfo) => {
    // msg:
    // byte 0 = len(apSsid+apPassword)+9
    // byte 1~6 = Mac address
    // byte 7~10 = IP address
    if (msg && msg.length == (1 + 6 + 4) && msg[0] == ExpectOneByte) {
      res.acked = true
      res.rinfo = rinfo
      res.bssid = msg.slice(1, 7).toString('hex')
      const ipRaw = new Uint8Array(4)
      msg.copy(ipRaw, 0, 7, 11)
      res.ip = ipRaw.join('.')
    } else {
      console.error('discarded: ' + msg.toString('hex'))
    }
    //console.log(`server got: ${msg.toString('hex')} from ${rinfo.address}:${rinfo.port}`)
  })

  sock.on('listening', () => {
    const address = sock.address()
    console.log(`server listening ${address.address}:${address.port}`)
  })

  sock.bind(ListeningPort)

  // broadcast address: 234.1.1.1 ~ 234.100.100.100
  let _count = 0
  function getTargetHostname() {
    _count %= 100
    _count++
    return `234.${_count}.${_count}.${_count}`
  }

  while (!res.acked && !res.err) {
    if (currentTime - lastTime >= TimeoutTotalCodeMillisecond) {
      //console.log('send gc')
      while (Date.now() - currentTime < TimeoutGuideCodeMillisecond && !res.acked && !res.err) {
        await sendPackets(sock, gcPackets, getTargetHostname(), TargetPort, IntervalGuideCodeMillisecond)
        if (Date.now() - startTime > WaitUdpSendingMillisecond) {
          break
        }
      }
      lastTime = currentTime
    } else {
      const step = 3
      const start = index * step
      const section = dcPackets.slice(start, start + step)
      //console.log(index, section[0].length, section[1].length, section[2].length)
      await sendPackets(sock, section, getTargetHostname(), TargetPort, IntervalDataCodeMillisecond)
      index = (index + 1) % (dcPackets.length / step)
    }
    currentTime = Date.now()
    // check whether the udp is send enough time
    if (currentTime - startTime > WaitUdpSendingMillisecond) {
      break
    }
  }
  sock.close()
  return res
}

async function sendPackets(sock, packets, targetHostname, targetPort, interval) {
  for (const pack of packets) {
    sock.send(pack, 0, pack.length, targetPort, targetHostname, (err) => {
      if (err) {
        console.log(err)
        sock.close()
      }
    })
    await sleep(interval)
  }
}

async function sleep(ms) {
  return new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        resolve()
      }, ms)
    } catch (e) {
      reject(e)
    }
  })
}

module.exports = {execute}
