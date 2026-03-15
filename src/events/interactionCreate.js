import { MessageFlags } from "discord.js";

export default (client) => {
  client.on("interactionCreate", async (interaction) => {
    
    // 1. TRATAMENTO DE AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        // Apenas logamos. No autocomplete não se usa reply/followUp.
        console.error(`Erro no autocomplete [${interaction.commandName}]:`, error);
      }
      return; 
    }

    // 2. TRATAMENTO DE COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Erro no comando [${interaction.commandName}]:`, error);

        // Se a interação expirou (Unknown Interaction), não tentamos responder
        if (error.code === 10062) return;

        const errorMsg = { 
          content: "❌ Ocorreu um erro interno ao processar este comando.", 
          flags: [MessageFlags.Ephemeral] 
        };

        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorMsg);
          } else {
            await interaction.reply(errorMsg);
          }
        } catch (e) {
          // Ignora erros de "Already Acknowledged" no catch final
        }
      }
    }
  });
};