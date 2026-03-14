import { REST, Routes } from "discord.js";
import { config } from "dotenv";
config();

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function clear() {
  console.log("🧹 Limpando comandos globais...");
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: [] }
  );
  console.log("✔ Comandos globais apagados!");
}

clear();
