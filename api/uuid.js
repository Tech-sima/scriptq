// Simple Vercel serverless endpoint that returns a UUID and timestamp
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const uuid = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ cryptoRandom() & 15 >> c / 4).toString(16)
  )
  res.json({ uuid, ts: Date.now() })
}

function cryptoRandom(){
  // small crypto fallback for serverless environment
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const r = new Uint8Array(1)
    crypto.getRandomValues(r)
    return r[0]
  }
  return Math.floor(Math.random()*256)
}
