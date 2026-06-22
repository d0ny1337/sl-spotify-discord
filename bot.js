require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    ActivityType,
    Events
} = require("discord.js");

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

    if (value.getTime) {
        return value.getTime();
    }

    return Number(value);
}

function getCurrentSpotifyData() {
    if (!currentSpotify) {
        return {
            playing: false,
            text: "🎵 Spotify\nNothing playing"
        };
    }

    let progressText = "??:??";
    let durationText = "??:??";

    if (currentSpotify.start && currentSpotify.end) {
        const now = Date.now();

        let progressMs = now - currentSpotify.start;
        let durationMs = currentSpotify.end - currentSpotify.start;

        if (progressMs < 0) progressMs = 0;
        if (progressMs > durationMs) progressMs = durationMs;

        progressText = formatMsToTime(progressMs);
        durationText = formatMsToTime(durationMs);
    }

    const text =
        `🎵 Spotify ▶\n` +
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
        text
    };
}

client.once(Events.ClientReady, () => {
    console.log(`Бот запущен: ${client.user.tag}`);
    console.log("Ожидаю изменения Discord Presence...");
    console.log("API сервер будет доступен на:");
    console.log(`http://localhost:${PORT}/now-playing`);
    console.log(`http://localhost:${PORT}/now-playing-text`);
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

    currentSpotify = {
        username,
        discordUserId,
        artist,
        track,
        start,
        end
    };

    const data = getCurrentSpotifyData();

    console.clear();
    console.log("=================================");
    console.log("SPOTIFY НАЙДЕН");
    console.log(`Пользователь: ${username}`);
    console.log(`Discord ID: ${discordUserId}`);
    console.log(`Исполнитель: ${artist}`);
    console.log(`Трек: ${track}`);
    console.log(`Прогресс: ${data.progress} / ${data.duration}`);
    console.log("=================================");
});

setInterval(() => {
    if (!currentSpotify) return;

    const data = getCurrentSpotifyData();

    console.clear();
    console.log("=================================");
    console.log("SPOTIFY ТЕКУЩИЙ ПРОГРЕСС");
    console.log(`Пользователь: ${data.username}`);
    console.log(`Discord ID: ${data.discordUserId}`);
    console.log(`Исполнитель: ${data.artist}`);
    console.log(`Трек: ${data.track}`);
    console.log(`Прогресс: ${data.progress} / ${data.duration}`);
    console.log("=================================");
}, 1000);

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