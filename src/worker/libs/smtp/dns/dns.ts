import dns from 'dns'
import { redis } from '../../../../utils/redis'


export const getMx = async (domain: string): Promise<dns.MxRecord[]> => {
  return new Promise(r =>
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses) return r([] as dns.MxRecord[])
      r(addresses)
    })
  )
}

export const getBestMx = async (domain: string): Promise<dns.MxRecord | undefined> => {
  const bestMx = await redis.client.get(`smtp-best-mx:${domain}`)

  if (bestMx) {
    return JSON.parse(bestMx)
  }

  const addresses = await getMx(domain)
  let bestIndex = 0

  for (let i = 0; i < addresses.length; i++) {
    if (addresses[i].priority < addresses[bestIndex].priority) {
      bestIndex = i
    }
  }

  if (addresses[bestIndex]) {
    await redis.client.set(`smtp-best-mx:${domain}`, JSON.stringify(addresses[bestIndex]), {
      EX: 60 * 60 * 24,
    })
  }

  return addresses[bestIndex]
}
