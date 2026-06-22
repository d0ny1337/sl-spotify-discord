require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, ActivityType, Events } = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

let currentSpotify = null;

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

function getCurrentSpotifyData() {
    if (!currentSpotify) {
        return {
            playing: false,
            text: "🎵 Spotify\nNothing playing"
        };
    }

    const now = Date.now();

    let progressMs =
        currentSpotify.baseProgressMs + (now - currentSpotify.receivedAtMs);

    let durationMs = currentSpotify.durationMs;

    if (progressMs < 0) progressMs = 0;
    if (progressMs > durationMs) progressMs = durationMs;

    const progressText = formatMsToTime(progressMs);
    const durationText = formatMsToTime(durationMs);

    const text =
        `${currentSpotify.artist} — ${currentSpotify.track}\n` +
        `${progressText} / ${durationText}`;

    return {
        playing: true,
        username: currentSpotify.username,
        discordUserId: currentSpotify.discordUserId,
        artist: currentSpotify.artist,
        track: currentSpotify.track,
        progress: progressText,
        duration: durationText,
        progressMs,
        durationMs,
        text
    };
}

client.once(Events.ClientReady, () => {
    console.log(`Бот запущен: ${client.user.tag}`);
    console.log("Ожидаю изменения Discord Presence...");
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
        if (currentSpotify && currentSpotify.discordUserId === discordUserId) {
            currentSpotify = null;
            console.log("Spotify остановлен или скрыт.");
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

        // Важно: если часы Render и Discord расходятся,
        // не даём прогрессу застрять на 00:00.
        baseProgressMs = Date.now() - start;

        if (baseProgressMs < 0) baseProgressMs = 0;
        if (baseProgressMs > durationMs) baseProgressMs = 0;
    }

    currentSpotify = {
        username,
        discordUserId,
        artist,
        track,
        start,
        end,
        durationMs,
        baseProgressMs,
        receivedAtMs: Date.now()
    };

    const data = getCurrentSpotifyData();

    console.log("=================================");
    console.log("SPOTIFY НАЙДЕН");
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
    res.json(getCurrentSpotifyData());
});

app.get("/now-playing-text", (req, res) => {
    const data = getCurrentSpotifyData();
    res.type("text/plain").send(data.text);
});

app.listen(PORT, () => {
    console.log(`HTTP API запущен на порту ${PORT}`);
});

client.login(DISCORD_TOKEN);
