const {
  Client,
  GatewayIntentBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js')

const crypto = require('crypto')

const BOT_TOKEN     = 'CLIENT_BOT_TOKEN'
const CLIENT_ID     = 'CLIENT_BOT_CLIENT_ID'
const GUILD_ID      = 'CLIENT_GUILD_ID'
const PANEL_CHANNEL = 'CLIENT_PANEL_CHANNEL_ID'
const ADMIN_ROLE    = 'Owner'        
const ACCESS_ROLE   = 'Access'       

const API          = 'https://xploits.lovable.app'
const ADMIN_SECRET = 'Frenglish-&3v8.!?/3-Genkey'
function generateKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase()
  return `${seg()}-${seg()}-${seg()}-${seg()}`
}

function parseDuration(str) {
  str = str.toLowerCase().trim()
  if (str === 'lifetime') return -1
  const match = str.match(/^(\d+)(d|m|y)$/)
  if (!match) return null
  const n = parseInt(match[1])
  const unit = match[2]
  const ms = unit === 'd' ? n * 86400000
           : unit === 'm' ? n * 30 * 86400000
           : n * 365 * 86400000
  return Date.now() + ms
}

function formatExpiry(expiry) {
  if (expiry === -1) return '♾️ Never (lifetime)'
  const d = new Date(expiry)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

function daysLeft(expiry) {
  if (expiry === -1) return '∞'
  return Math.max(0, Math.ceil((expiry - Date.now()) / 86400000))
}

const ok   = (desc)        => new EmbedBuilder().setColor(0x57F287).setDescription(desc)
const err  = (desc)        => new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${desc}`)
const info = (title, desc) => new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(desc)

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('generatekey')
      .setDescription('Generate a new script key')
      .addStringOption(opt =>
        opt.setName('duration')
          .setDescription('e.g. 7d, 30d, 1m, 1y, lifetime')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('note')
          .setDescription('Optional note (e.g. buyer username)')
          .setRequired(false)
      )
      .toJSON()
  ]

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  console.log('Slash commands registered.')
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

const userKeyCache = new Map()

async function resolveUserKey(userId) {
  if (userKeyCache.has(userId)) return userKeyCache.get(userId)

  const res = await fetch(`${API}/keys/user?user_id=${userId}`)
  const text = await res.text()
  if (text === 'none' || text === 'expired' || text === 'invalid') return null

  userKeyCache.set(userId, text)
  return text
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`)
  await registerCommands()

  const channel = await client.channels.fetch(PANEL_CHANNEL)

  const embed = new EmbedBuilder()
    .setTitle('🔑 Script Access Panel')
    .setDescription(
      'Use the buttons below to manage your script access.\n\n' +
      '**Redeem Key** - Enter your key to activate\n' +
      '**Get Script** - Get your personalized Lua script\n' +
      '**Key Stats** - Check your key expiry & status'
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Keys are personal. Do not share them.' })

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('redeem').setLabel('Redeem Key').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('getscript').setLabel('Get Script').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('getstats').setLabel('Key Stats').setStyle(ButtonStyle.Secondary),
  )

  await channel.send({ embeds: [embed], components: [row] })
})

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand() && interaction.commandName === 'generatekey') {
    const isAdmin = interaction.member.roles.cache.some(r => r.name === ADMIN_ROLE)
                 || interaction.member.permissions.has('Administrator')

    if (!isAdmin) {
      return interaction.reply({ embeds: [err('You do not have permission to use this command.')], ephemeral: true })
    }

    const durationStr = interaction.options.getString('duration')
    const note        = interaction.options.getString('note') || null
    const expiry      = parseDuration(durationStr)

    if (expiry === null) {
      return interaction.reply({
        embeds: [err('Invalid duration. Use formats like `7d`, `30d`, `1m`, `1y`, or `lifetime`.')],
        ephemeral: true
      })
    }

    await interaction.deferReply({ ephemeral: true })

    const key = generateKey()

    const res = await fetch(`${API}/keys/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_SECRET}`
      },
      body: JSON.stringify({
        key,
        expiry,
        note,
        created_by: interaction.user.id
      })
    })

    if (!res.ok) {
      return interaction.editReply({ embeds: [err('Failed to save key. Check your API connection.')] })
    }

    await interaction.editReply({
      embeds: [info('✅ Key Generated',
        `**Key:** \`${key}\`\n` +
        `**Duration:** ${durationStr}\n` +
        `**Expires:** ${formatExpiry(expiry)}\n` +
        (note ? `**Note:** ${note}` : '')
      )]
    })
  }

  if (interaction.isButton()) {
    const userId = interaction.user.id

    if (interaction.customId === 'redeem') {
      const modal = new ModalBuilder()
        .setCustomId('redeemModal')
        .setTitle('Redeem a Key')

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('keyInput')
            .setLabel('Enter your key (XXXX-XXXX-XXXX-XXXX):')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ABCD-1234-EF56-7890')
            .setRequired(true)
        )
      )

      return interaction.showModal(modal)
    }

    if (interaction.customId === 'getscript') {
      const key = await resolveUserKey(userId)

      if (!key) {
        return interaction.reply({
          embeds: [err('You have not redeemed a key yet. Click **Redeem Key** first.')],
          ephemeral: true
        })
      }

      const check = await fetch(`${API}/checkkey?key=${encodeURIComponent(key)}`)
      const status = await check.text()

      if (status !== 'valid') {
        userKeyCache.delete(userId)
        return interaction.reply({
          embeds: [err(`Your key has **${status}**. Please get a new one.`)],
          ephemeral: true
        })
      }

      const scriptRes = await fetch(`${API}/script?key=${encodeURIComponent(key)}`)
      const lua = await scriptRes.text()

      await interaction.reply({
        embeds: [ok(
          `Here is your script:\n\`\`\`lua\n${lua}\n\`\`\`\n⚠️ Do **not** share this with anyone.`
        )],
        ephemeral: true
      })
    }

    if (interaction.customId === 'getstats') {
      const key = await resolveUserKey(userId)

      if (!key) {
        return interaction.reply({
          embeds: [err('You have not redeemed a key yet.')],
          ephemeral: true
        })
      }

      const check  = await fetch(`${API}/checkkey?key=${encodeURIComponent(key)}`)
      const status = await check.text()

      const expRes  = await fetch(`${API}/getexpiry?key=${encodeURIComponent(key)}`)
      const expText = await expRes.text()

      let expiryDisplay, daysDisplay
      if (expText === 'never') {
        expiryDisplay = '♾️ Never (lifetime)'
        daysDisplay   = '∞'
      } else {
        const expiry  = new Date(expText).getTime()
        expiryDisplay = formatExpiry(expiry)
        daysDisplay   = daysLeft(expiry)
      }

      await interaction.reply({
        embeds: [info('🔑 Key Stats',
          `**Key:** \`${key}\`\n` +
          `**Status:** ${status === 'valid' ? ' Valid' : ' ' + status}\n` +
          `**Days remaining:** ${daysDisplay}\n` +
          `**Expires:** ${expiryDisplay}`
        )],
        ephemeral: true
      })
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'redeemModal') {
    await interaction.deferReply({ ephemeral: true })

    const key    = interaction.fields.getTextInputValue('keyInput').trim().toUpperCase()
    const userId = interaction.user.id

    const res  = await fetch(`${API}/keys/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, user_id: userId })
    })
    const result = await res.text()

    if (result === 'valid') {
      userKeyCache.set(userId, key)

      try {
        const role = interaction.guild.roles.cache.find(r => r.name === ACCESS_ROLE)
        if (role && !interaction.member.roles.cache.has(role.id)) {
          await interaction.member.roles.add(role)
        }
      } catch (_) {}

      return interaction.editReply({
        embeds: [ok(
          `Key redeemed successfully!\n\n` +
          `You now have the **${ACCESS_ROLE}** role and can use **Get Script** and **Key Stats**.`
        )]
      })
    }

    if (result === 'expired') {
      return interaction.editReply({ embeds: [err('This key has **expired**. Please get a new one.')] })
    }

    if (result === 'taken') {
      return interaction.editReply({ embeds: [err('This key is already in use by another user.')] })
    }

    return interaction.editReply({ embeds: [err('Invalid key. Double-check and try again.')] })
  }
})

client.login(BOT_TOKEN)
