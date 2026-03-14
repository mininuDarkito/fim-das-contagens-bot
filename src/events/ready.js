export default (client) => {
  client.once("ready", () => {
    console.log(`Bot online: ${client.user.tag}`);
  });
};
