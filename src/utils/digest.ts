export async function digest(input: string | ArrayBuffer) {
  let data

  if (typeof input === 'string') {
    const encoder = new TextEncoder()
    data = encoder.encode(input)
  } else if (input instanceof ArrayBuffer) {
    data = input
  } else {
    throw new TypeError('Input must be a string or an ArrayBuffer')
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', data) // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}
