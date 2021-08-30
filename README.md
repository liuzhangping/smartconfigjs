# smartconfigjs

Pure javascript implementation version of SmartConfig(ESPTouch).

Usage:

```javascript
const { execute } = require('smartconfigjs')
const apSsid = 'your SSID'
const apBssid = 'your bssid'
const apPwd = 'your password'
const ip = 'your ip'

const res = await execute(apSsid, apBssid, apPwd, ip, false)
console.log('res: ' + JSON.stringify(res, null, 4))
```
