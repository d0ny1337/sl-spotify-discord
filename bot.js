require("dotenv").config();

const express = require("express");
const {
    Client,
    GatewayIntentBits,
    ActivityType,
    Events,
    SlashCommandBuilder
} = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://sl-spotify-discord.onrender.com";
const GUILD_ID = process.env.GUILD_ID || null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

const spotifyByUserId = new Map();

function formatMsToTime(ms) {
    if (!ms || ms < 0) return "00:00";

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimestampMs(value) {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;

    if (typeof value === "string") {
        const parsedDate = Date.parse(value);
        if (!Number.isNaN(parsedDate)) return parsedDate;

        const parsedNumber = Number(value);
        if (!Number.isNaN(parsedNumber)) return parsedNumber;
    }

    return null;
}

function buildSpotifyData(saved) {
    if (!saved) {
        return {
            playing: false,
            text: "Nothing playing"
        };
    }

    const now = Date.now();

    let progressMs = saved.baseProgressMs + (now - saved.receivedAtMs);
    let durationMs = saved.durationMs;

    if (progressMs < 0) progressMs = 0;
    if (durationMs < 0) durationMs = 0;
    if (durationMs > 0 && progressMs > durationMs) progressMs = durationMs;

    const progressText = formatMsToTime(progressMs);
    const durationText = formatMsToTime(durationMs);

    const text =
        `${saved.artist} — ${saved.track}\n` +
        `${progressText} / ${durationText}`;

    return {
        playing: true,
        username: saved.username,
        discordUserId: saved.discordUserId,
        artist: saved.artist,
        track: saved.track,
        progress: progressText,
        duration: durationText,
        progressMs,
        durationMs,
        text
    };
}

function getUserData(discordUserId) {
    return buildSpotifyData(spotifyByUserId.get(discordUserId));
}

function getFirstActiveData() {
    const first = spotifyByUserId.values().next().value;
    return buildSpotifyData(first);
}

async function registerCommands() {
    const linkCommand = new SlashCommandBuilder()
        .setName("link")
        .setDescription("Получить персональную ссылку для Second Life Spotify display");

    if (GUILD_ID) {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.commands.set([linkCommand]);
        console.log(`Команда /link зарегистрирована на сервере ${GUILD_ID}`);
    } else {
        await client.application.commands.set([linkCommand]);
        console.log("Команда /link зарегистрирована глобально. Может появиться не сразу.");
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`Бот запущен: ${client.user.tag}`);
    console.log("Ожидаю Spotify Presence...");

    try {
        await registerCommands();
    } catch (error) {
        console.error("Ошибка регистрации /link:", error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "link") {
        const discordId = interaction.user.id;
        const url = `${PUBLIC_BASE_URL}/user/${discordId}/text`;

        await interaction.reply({
            content:
                `Ваша персональная ссылка для Second Life:\n\n` +
                `${url}\n\n` +
                `Вставьте её в LSL-скрипт один раз. Она будет постоянной.`,
            ephemeral: true
        });
    }
});

client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (!newPresence) return;

    const username =
        newPresence.user?.username ||
        newPresence.member?.user?.username ||
        "Unknown";

    const discordUserId =
        newPresence.user?.id ||
        newPresence.member?.user?.id ||
        "Unknown";

    const spotifyActivity = newPresence.activities.find(
        activity =>
            activity.type === ActivityType.Listening &&
            activity.name === "Spotify"
    );

    if (!spotifyActivity) {
        if (spotifyByUserId.has(discordUserId)) {
            spotifyByUserId.delete(discordUserId);
            console.log(`Spotify остановлен: ${username} (${discordUserId})`);
        }
        return;
    }

    const track = spotifyActivity.details || "Unknown track";
    const artist = spotifyActivity.state || "Unknown artist";

    const start = getTimestampMs(spotifyActivity.timestamps?.start);
    const end = getTimestampMs(spotifyActivity.timestamps?.end);

    let durationMs = 0;
    let baseProgressMs = 0;

    if (start && end) {
        durationMs = end - start;
        baseProgressMs = Date.now() - start;

        if (baseProgressMs < 0) baseProgressMs = 0;
        if (baseProgressMs > durationMs) baseProgressMs = 0;
    }

    spotifyByUserId.set(discordUserId, {
        username,
        discordUserId,
        artist,
        track,
        start,
        end,
        durationMs,
        baseProgressMs,
        receivedAtMs: Date.now()
    });

    const data = getUserData(discordUserId);

    console.log("=================================");
    console.log("SPOTIFY ОБНОВЛЁН");
    console.log(`Пользователь: ${username}`);
    console.log(`Discord ID: ${discordUserId}`);
    console.log(`Исполнитель: ${artist}`);
    console.log(`Трек: ${track}`);
    console.log(`Прогресс: ${data.progress} / ${data.duration}`);
    console.log("=================================");
});

const app = express();

app.get("/", (req, res) => {
    res.type("text/plain").send("SL Spotify Discord Bot API is running");
});

app.get("/now-playing", (req, res) => {
    res.json(getFirstActiveData());
});

app.get("/now-playing-text", (req, res) => {
    const data = getFirstActiveData();
    res.type("text/plain").send(data.text);
});

app.get("/user/:discordId", (req, res) => {
    const data = getUserData(req.params.discordId);
    res.json(data);
});

app.get("/user/:discordId/text", (req, res) => {
    const data = getUserData(req.params.discordId);
    res.type("text/plain").send(data.text);
});

app.listen(PORT, () => {
    console.log(`HTTP API запущен на порту ${PORT}`);
});

client.login(DISCORD_TOKEN);
