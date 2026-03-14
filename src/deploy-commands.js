import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { config } from "dotenv";

config();

const commands = [];
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

  console.log(`📥 Carregando comando: ${command.default.data.name}`);
  commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
);

console.log("✔ Comandos registrados com sucesso!");
