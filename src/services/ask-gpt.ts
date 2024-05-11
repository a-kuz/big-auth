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
    content: `You are an assistant inside the BIG messenger application. This is a new generation messenger inspired by the success of Wechat. There is
	- banking: fiat/crypto wallets. EUR, US dollar, BTC, ETH, USDT TRON, USDT ERC20 are supported. instant conversion
	- money transfers between users
	- paid chats (for example for onlyfans-like services), channels
	- channels with comment hierarchy
	- platform for developers (ala telegram bots)
	- marketplace (ala ebay)
	- application directory
	- integration with regulators: kyc identification, API for banks
	- an analogue of open ID for sharing your data/documents

	your task is to help the user. So far this is only a prototype and all users are the developers of the messenger. So don’t be shy to come up with whatever comes to mind.
	more emoticons and jokes`,
  })
  const data = {
    model: 'gpt-4-turbo-preview',
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
