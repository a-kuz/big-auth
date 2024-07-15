export async function generateKey(key: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)

  const cryptoKey = await crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
  return cryptoKey
}

export async function encrypt(data: string, key: string): Promise<string> {
  const cryptoKey = await generateKey(key)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    cryptoKey,
    dataBuffer,
  )

  const encryptedData = new Uint8Array(encryptedBuffer)
  const combinedData = new Uint8Array(iv.byteLength + encryptedData.byteLength)
  combinedData.set(iv, 0)
  combinedData.set(encryptedData, iv.byteLength)

  return btoa(String.fromCharCode(...combinedData))
}

async function decrypt(data: string, key: string): Promise<string> {
  const cryptoKey = await generateKey(key)
  const combinedData = Uint8Array.from(atob(data), c => c.charCodeAt(0))

  const iv = combinedData.slice(0, 12)
  const encryptedData = combinedData.slice(12)

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    cryptoKey,
    encryptedData,
  )

  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

async function test() {
  const key = 'your-secret-key'
  const originalData = 'Hello, World!'

  const encryptedData = await encrypt(originalData, key)
  console.log('Encrypted:', encryptedData)

  const decryptedData = await decrypt(encryptedData, key)
  console.log('Decrypted:', decryptedData)
}
