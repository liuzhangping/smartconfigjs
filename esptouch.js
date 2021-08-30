'use strict'

const CRC_POLYNOM = 0x8c
const CRC_INITIAL = 0x00

const CRC_TABLE = []

for (let dividend = 0; dividend < 256; dividend++) {
  let remainder = dividend
  for (let bit = 0; bit < 8; bit++) {
    if ((remainder & 0x01) != 0) {
      remainder = (remainder >>> 1) ^ CRC_POLYNOM
    } else {
      remainder >>>= 1
    }
  }
  CRC_TABLE[dividend] = remainder & 0xffff
}

function crcBuffer(buffer) {
  let value = CRC_INITIAL
  for (let i = 0; i < buffer.length; i++) {
    const data = buffer[i] ^ value
    value = (CRC_TABLE[data & 0xff] ^ (value << 8))
  }
  return value
}

const GUIDE_CODES = [515, 514, 513, 512]

function toDataCodes(u8, index) {
  if (index > 127) {  // max index
    throw `Bad index ${index}`
  }

  const combByte = (hiQ, lowQ) => ((hiQ << 4) | lowQ)
  const byteHigh = (b) => ((b & 0xf0) >> 4)
  const byteLow = (b) => (b & 0x0f)

  const dataHigh = byteHigh(u8)
  const dataLow = byteLow(u8)
  const crcValue = crcBuffer(Buffer.from([u8 & 0xff, index]))
  const crcHigh = byteHigh(crcValue)
  const crcLow = byteLow(crcValue)

  return Buffer.from([0, combByte(crcHigh, dataHigh), 1, index, 0, combByte(crcLow, dataLow)])
}

function toPackets(codes) {
  const packets = []
  for (const code of codes) {
    packets.push(Buffer.alloc(code, '1'))
  }
  return packets
}

function toRawBssid(bssid) {
  return Buffer.from(bssid.replace(/[-:]/g, ''), 'hex')
}

function toRawIpv4(ip) {
  const decs = ip.split('.')
  if (!decs || decs.length != 4) {
    throw `Bad IP address "${ip}"`
  }
  return Buffer.from(decs.map(d => parseInt(d)))
}

function toDatumCode(apSsid, apBssid, apPassword, ipAddress, isSsidHidden = false) {
  let totalXor = 0
  const apSsidRaw = Buffer.from(apSsid)
  const apSsidCrc = crcBuffer(apSsidRaw)
  const apSsidLen = apSsidRaw.length

  const apBssidCrc = crcBuffer(toRawBssid(apBssid))

  const apPwdRaw = Buffer.from(apPassword)
  const apPwdLen = apPwdRaw.length

  const rawIp = toRawIpv4(ipAddress)
  const ipLen = rawIp.length

  const EXTRA_HEAD_LEN = 5
  const totalLen = (EXTRA_HEAD_LEN + ipLen + apPwdLen + apSsidLen)
  
  const dataCodes = []

  const addDataCode = (v, index) => {
    dataCodes.push(toDataCodes(v, index))
    totalXor ^= v
  }

  let index = 0

  addDataCode(totalLen, index++)
  addDataCode(apPwdLen, index++)
  addDataCode(apSsidCrc, index++)
  addDataCode(apBssidCrc, index++)

  const totalXorIndex = index // save totalXor index

  dataCodes.push(null)  // to fill totalXor
  index++
  
  for (let i = 0; i < ipLen; i++) {
    addDataCode(rawIp[i], index++)
  }

  for (let i = 0; i < apPwdLen; i++) {
    addDataCode(apPwdRaw[i], index++)
  }

  for (let i = 0; i < apSsidRaw.length; i++) {
    totalXor ^= apSsidRaw[i]
  }

  if (isSsidHidden) {
    for (let i = 0; i < apSsidRaw.length; i++) {
      dataCodes.push(toDataCodes(apSsidRaw[i], index++))
    }
  }

  dataCodes[totalXorIndex] = toDataCodes(totalXor, totalXorIndex)

  const bytes = []
  for (const dataCode of dataCodes) {
    for (const b of dataCode) {
      bytes.push(b)
    }
  }

  const u16s = []
  for (let i = 0; i < bytes.length / 2; i++) {
    const n = i * 2
    u16s.push(((bytes[n] << 8) | bytes[n + 1]) + 40)  // EXTRA_LEN
  }
  return u16s
}

module.exports = {
  GUIDE_CODES,
  toDatumCode,
  toPackets
}
