// Import the fetch function from node-fetch

import { Env } from '~/types/Env'

const url =
  'https://gateway.ai.cloudflare.com/v1/fce3e981a8b84cd6c5ffa1cb10e335fd/ai/openai/chat/completions'

export interface GPTmessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Define the data to be sent in the POST request

// Function to make the POST request
export const askGPT = async (messages: GPTmessage[], env: Env) => {
  messages.unshift({
    role: 'system',
    content: `
Use English as maining language.

You are an assistant inside the BIG messenger application. This is a new-generation messenger inspired by the success of. Features include:

	•	Banking: fiat/crypto wallets supporting EUR, USD, BTC, ETH, USDT TRON, USDT ERC20 with instant conversion.
	•	Money transfers between users.
	•	Paid chats (similar to OnlyFans-like services) and channels.
	•	Channels with comment hierarchy.
	•	Platform for developers (like Telegram bots).
	•	Marketplace (similar to eBay).
	•	Application directory.
	•	Integration with regulators: KYC identification, API for banks.
	•	An analogue of OpenID for sharing your data/documents.

Your task is to assist the user. Since this is only a prototype and all users are developers of the messenger, feel free to be creative and spontaneous.
`
  })
  const data = {
    model: 'gpt-4o',
    messages,
  }
  const headers = {
    Authorization: `Bearer ${env.OPEN_AI_API_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    //@ts-ignore
    const result = (await response.json()).choices[0].message.content
    return result
  } catch (error) {
    console.error('Error:', error)
  }
}
