
export async function digest(data: ArrayBuffer) {
	const hashBuffer = await crypto.subtle.digest("SHA-256", data); // hash the message
	const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join(""); // convert bytes to hex string
	return hashHex;
}
