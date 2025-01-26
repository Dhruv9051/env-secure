import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

const algorithm = "aes-256-cbc"; // AES encryption algorithm with 256-bit key in CBC mode
const salt = "some-fixed-salt"; // Fixed salt for key derivation (consider using a random salt for production)
const keyLength = 32; // 32 bytes for AES-256 key

/**
 * Derives a cryptographic key from a passphrase using scrypt.
 * @param {string} passphrase - The passphrase to derive the key from.
 * @returns {Buffer} - The derived key as a Buffer.
 */
function deriveKeyFromPassphrase(passphrase) {
  if (!passphrase) {
    throw new Error("Passphrase cannot be empty.");
  }
  return crypto.scryptSync(passphrase, salt, keyLength);
}

/**
 * Encrypts a string using AES-256-CBC.
 * @param {string} text - The text to encrypt.
 * @param {string} secretKey - The secret key for encryption.
 * @returns {string} - The encrypted string in the format "iv:encryptedText".
 */
export function encryptString(text, secretKey) {
  if (!text || !secretKey) {
    throw new Error("Text and secret key are required for encryption.");
  }
  const key = crypto.scryptSync(secretKey, salt, keyLength); // Derive key from secretKey
  const iv = crypto.randomBytes(16); // Generate a random initialization vector
  const cipher = crypto.createCipheriv(algorithm, key, iv); // Create cipher instance
  let encrypted = cipher.update(text, "utf-8", "hex"); // Encrypt the text
  encrypted += cipher.final("hex"); // Finalize encryption
  return `${iv.toString("hex")}:${encrypted}`; // Return IV and encrypted text
}

/**
 * Decrypts a string encrypted with AES-256-CBC.
 * @param {string} encryptedText - The encrypted text in the format "iv:encryptedText".
 * @param {string} secretKey - The secret key for decryption.
 * @returns {string} - The decrypted text.
 */
export function decryptString(encryptedText, secretKey) {
  if (!encryptedText || !secretKey) {
    throw new Error("Encrypted text and secret key are required for decryption.");
  }
  const [ivHex, encrypted] = encryptedText.split(":"); // Split IV and encrypted text
  if (!ivHex || !encrypted) {
    throw new Error("Invalid encrypted text format. Expected 'iv:encryptedText'.");
  }

  const key = crypto.scryptSync(secretKey, salt, keyLength); // Derive key from secretKey
  const iv = Buffer.from(ivHex, "hex"); // Convert IV from hex to Buffer
  const decipher = crypto.createDecipheriv(algorithm, key, iv); // Create decipher instance
  let decrypted = decipher.update(encrypted, "hex", "utf-8"); // Decrypt the text
  decrypted += decipher.final("utf-8"); // Finalize decryption
  return decrypted;
}

/**
 * Reads the secret key from the .env file.
 * @returns {string} - The secret key.
 * @throws {Error} - If the .env file or ENV_SECURE_KEY is missing.
 */
export function getSecretKey() {
  const envFilePath = path.join(process.cwd(), ".env"); // Path to .env file
  if (!fs.existsSync(envFilePath)) {
    return null; // Return null if .env file does not exist
  }

  const envContent = fs.readFileSync(envFilePath, "utf-8"); // Read .env file
  const secretKeyMatch = envContent.match(/ENV_SECURE_KEY=(.+)/); // Extract ENV_SECURE_KEY

  if (!secretKeyMatch || !secretKeyMatch[1]) {
    return null; // Return null if ENV_SECURE_KEY is not found
  }

  return secretKeyMatch[1].trim(); // Return the secret key
}

/**
 * Encrypts an entire .env file and writes the output to a new file.
 * @param {string} filePath - Path to the .env file.
 * @param {string} outputPath - Path to save the encrypted file.
 * @param {string} passphrase - Passphrase for encrypting the secret key.
 */
export function encryptEnv(filePath, outputPath, passphrase) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${filePath} does not exist.`);
  }

  // Retrieve the secret key
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new Error("Secret key is required for encryption.");
  }

  // Read the .env file
  const envContent = fs.readFileSync(filePath, "utf-8");
  if (!envContent) {
    throw new Error(`File ${filePath} is empty.`);
  }

  // Split the file into lines
  const lines = envContent.split("\n");

  // Encrypt the secret key using the passphrase
  const derivedKey = deriveKeyFromPassphrase(passphrase);
  const encryptedSecretKey = encryptString(`ENV_SECURE_KEY=${secretKey}`, derivedKey);

  // Add the encrypted secret key as the first line
  const encryptedLines = [`SECRET_KEY=${encryptedSecretKey}`];

  // Encrypt each line of the .env file
  lines.forEach((line) => {
    if (line.trim() === "" || line.startsWith("#")) {
      // Skip empty lines and comments
      encryptedLines.push(line);
    } else {
      // Encrypt the line
      encryptedLines.push(encryptString(line, secretKey));
    }
  });

  // Write the encrypted content to the output file
  fs.writeFileSync(outputPath, encryptedLines.join("\n"));

  // Delete the original .env file
  fs.removeSync(filePath);

  // Extract file names from paths
  const fileName = path.basename(filePath);
  const outputFileName = path.basename(outputPath);

  console.log(chalk.green(`Successfully encrypted ${fileName} to ${outputFileName}.`));
}

/**
 * Decrypts an encrypted .env file and writes the output to a new file.
 * @param {string} filePath - Path to the encrypted file.
 * @param {string} outputPath - Path to save the decrypted file.
 * @param {string} passphrase - Passphrase for decrypting the secret key.
 * @throws {Error} - If the encrypted file is invalid.
 */
export function decryptEnv(filePath, outputPath, passphrase) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${filePath} does not exist.`);
  }

  const envContent = fs.readFileSync(filePath, "utf-8"); // Read the encrypted file
  const lines = envContent.split("\n"); // Split file into lines

  // Extract the encrypted secret key from the first line
  const secretKeyLine = lines[0];
  if (!secretKeyLine || !secretKeyLine.startsWith("SECRET_KEY=")) {
    throw new Error("Encrypted file is invalid: Secret key not found.");
  }

  const encryptedSecretKey = secretKeyLine.split("=")[1]; // Extract the encrypted secret key

  // Decrypt the secret key using the passphrase
  const derivedKey = deriveKeyFromPassphrase(passphrase);
  const decryptedSecretKeyLine = decryptString(encryptedSecretKey, derivedKey);

  // Extract the secret key from the decrypted line
  const secretKeyMatch = decryptedSecretKeyLine.match(/ENV_SECURE_KEY=(.+)/);
  if (!secretKeyMatch || !secretKeyMatch[1]) {
    throw new Error("Encrypted file is invalid: Secret key not found.");
  }

  const secretKey = secretKeyMatch[1]; // Retrieve the secret key

  // Decrypt each line of the file
  const decryptedLines = lines.slice(1).map((line) => {
    if (line.trim() === "" || line.startsWith("#")) {
      return line; // Skip empty lines and comments
    }
    return decryptString(line, secretKey); // Decrypt the line
  });

  fs.writeFileSync(outputPath, decryptedLines.join("\n")); // Write decrypted content to output file
  fs.removeSync(filePath); // Delete the encrypted file

  // Extract file names from paths
  const fileName = path.basename(filePath);
  const outputFileName = path.basename(outputPath);

  console.log(chalk.green(`Successfully decrypted ${fileName} to ${outputFileName}.`));
}