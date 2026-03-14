import { Client, GatewayIntentBits, Collection } from "discord.js";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

const commandsPath = path.join(process.cwd(), "src/commands");

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);

  if (!command.default || !command.default.data) {
    console.warn(`⚠️ O comando ${file} está inválido e foi ignorado.`);
    continue;
  }

  client.commands.set(command.default.data.name, command.default);
}

import interactionCreate from "./events/interactionCreate.js";
import ready from "./events/ready.js";

interactionCreate(client);
ready(client);

client.login(process.env.TOKEN);
