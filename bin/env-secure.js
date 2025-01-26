#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { createInterface } from "readline";
import { encryptEnv, decryptEnv, getSecretKey } from "../lib/secure-env.js";

// Path to the .env file
const envFilePath = path.join(process.cwd(), ".env");

/**
 * Check if the secret key is already set in the .env file.
 * @returns {boolean} - True if the secret key is set, otherwise false.
 */
function isSecretKeySet() {
  if (!fs.existsSync(envFilePath)) {
    return false;
  }
  const envContent = fs.readFileSync(envFilePath, "utf-8");
  return /ENV_SECURE_KEY=/.test(envContent);
}

/**
 * Update the secret key in the .env file.
 * @param {string} newSecretKey - The new secret key to set.
 */
function updateSecretKey(newSecretKey) {
  fs.writeFileSync(envFilePath, `ENV_SECURE_KEY=${newSecretKey}\n`);
}

/**
 * Prompt the user for input and return the result.
 * @param {string} question - The question to ask the user.
 * @returns {Promise<string>} - The user's input.
 */
function promptUser(question) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

// Command to set the secret key (only works the first time)
program
  .command("set-key")
  .description("Set the secret key for encryption/decryption (only works the first time)")
  .action(async () => {
    if (isSecretKeySet()) {
      console.error(chalk.red("Error: Secret key is already set. Use `rotate-key` to change it."));
      process.exit(1);
    }

    const secretKey = await promptUser("Enter your secret key: ");
    if (!secretKey) {
      console.error(chalk.red("Error: Secret key cannot be empty."));
      process.exit(1);
    }

    // Save the secret key to the .env file
    updateSecretKey(secretKey);
    console.log(chalk.green("Secret key saved successfully."));
  });

// Command to encrypt a .env file
program
  .command("encrypt")
  .description("Encrypt a .env file")
  .action(async () => {
    const inputFile = path.join(process.cwd(), ".env");
    const outputFile = path.join(process.cwd(), ".env.enc");

    if (!fs.existsSync(inputFile)) {
      console.error(chalk.red(`Error: File ${inputFile} does not exist.`));
      process.exit(1);
    }

    const passphrase = await promptUser("Enter your passphrase: ");
    if (!passphrase) {
      console.error(chalk.red("Error: Passphrase cannot be empty."));
      process.exit(1);
    }

    try {
      encryptEnv(inputFile, outputFile, passphrase);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Command to decrypt a .env file
program
  .command("decrypt")
  .description("Decrypt a .env file")
  .action(async () => {
    const inputFile = path.join(process.cwd(), ".env.enc");
    const outputFile = path.join(process.cwd(), ".env");

    if (!fs.existsSync(inputFile)) {
      console.error(chalk.red(`Error: File ${inputFile} does not exist.`));
      process.exit(1);
    }

    const passphrase = await promptUser("Enter your passphrase: ");
    if (!passphrase) {
      console.error(chalk.red("Error: Passphrase cannot be empty."));
      process.exit(1);
    }

    try {
      decryptEnv(inputFile, outputFile, passphrase);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Command to rotate the secret key
program
  .command("rotate-key")
  .description("Change the secret key in the .env file (no encryption/decryption is performed)")
  .action(async () => {
    if (!isSecretKeySet()) {
      console.error(chalk.red("Error: Secret key is not set. Use `set-key` to set it first."));
      process.exit(1);
    }

    try {
      // Step 1: Verify the current secret key
      const currentSecretKey = await promptUser("Enter your current secret key: ");
      if (currentSecretKey !== getSecretKey()) {
        console.error(chalk.red("Error: Current secret key is incorrect."));
        process.exit(1);
      }

      // Step 2: Get the new secret key
      const newSecretKey = await promptUser("Enter your new secret key: ");
      if (!newSecretKey) {
        console.error(chalk.red("Error: New secret key cannot be empty."));
        process.exit(1);
      }

      // Step 3: Update the secret key in the .env file
      updateSecretKey(newSecretKey);
      console.log(chalk.green("Secret key updated successfully."));
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Parse command-line arguments
program.parse(process.argv);