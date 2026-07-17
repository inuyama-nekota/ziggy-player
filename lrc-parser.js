import { findLyricIndex, parseLrc } from "./lrc-parser.js";

const SONGS = [
  { id: "stay-gold", title: "STAY GOLD", artist: "ZIGGY" },
  { id: "gloria", title: "GLORIA", artist: "ZIGGY" },
];

const DB_NAME = "ziggy-player-private-media";
const DB_VERSION = 1;
const STORE_NAME = "songs";

const $ = (id) => document.getElementById(id);
const audio = $("audioPlayer");
const reel = $("songReel");
const reelLines = $("reelLines");
const playButton = $("playButton");
const seekBar = $("seekBar");
const setupSheet = $("setupSheet");

const state = {
  songIndex: 0,
  lyricIndex: -1,
  lyrics: [],
  objectUrl: null,
  pendingFiles: new Map(),
  loadToken: 0,
  allSongsReady: false,
  touchStartY: null,
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;

    try {
      result = callback(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("保存が中断されました。"));
    };
  });
}

async function getSongRecord(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function saveSongRecord(record) {
  await withStore("readwrite", (store) => store.put(record));
}

function normalizeIndex(index) {
  return (index + SONGS.length) % SONGS.length;
}

function renderReel(direction = null) {
  const previous = SONGS[normalizeIndex(state.songIndex - 1)];
  const current = SONGS[state.songIndex];
  const next = SONGS[normalizeIndex(state.songIndex + 1)];

  $("reelPrevious").textContent = previous.title;
  $("reelCurrent").textContent = current.title;
  $("reelCurrent").setAttribute("aria-label", `${current.title}、選択中`);
  $("reelNext").textContent = next.title;
  $("nowPlayingTitle").textContent = current.title;

  if (direction) {
    reelLines.classList.remove("move-up", "move-down");
    void reelLines.offsetWidth;
    reelLines.classList.add(direction === "next" ? "move-up" : "move-down");
  }
}

function setMessage(text = "", isError = false) {
  const message = $("playerMessage");
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setSetupMessage(text = "", isError = false) {
  const message = $("setupMessage");
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function updatePlayButton() {
  const isPlaying = !audio.paused && !audio.ended;
  playButton.textContent = isPlaying ? "Ⅱ" : "▶";
  playButton.setAttribute("aria-label", isPlaying ? "一時停止" : "再生");
  playButton.classList.toggle("is-playing", isPlaying);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function updateTimeline() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  $("currentTime").textContent = formatTime(current);
  $("durationTime").textContent = formatTime(duration);
  seekBar.value = duration > 0 ? Math.round((current / duration) * 1000) : 0;
}

function styleLyricLength(element, text) {
  element.classList.toggle("is-long", text.length > 28 && text.length <= 42);
  element.classList.toggle("is-very-long", text.length > 42);
}

function renderLyrics(nextIndex, animate = true) {
  const previousIndex = state.lyricIndex;
  state.lyricIndex = nextIndex;
  const previousText = nextIndex > 0 ? state.lyrics[nextIndex - 1]?.text || "" : "";
  const currentText = nextIndex >= 0 ? state.lyrics[nextIndex]?.text || "♪" : "♪";
  const nextText = state.lyrics[nextIndex + 1]?.text || "";
  const lines = [
    [$("previousLyric"), previousText],
    [$("currentLyric"), currentText],
    [$("nextLyric"), nextText],
  ];

  for (const [element, text] of lines) {
    element.textContent = text;
    styleLyricLength(element, text);
  }

  if (animate && previousIndex !== nextIndex) {
    $("lyricsStack").classList.remove("slide-up", "slide-down", "fade");
    void $("lyricsStack").offsetWidth;
    const difference = nextIndex - previousIndex;
    const animation = Math.abs(difference) === 1 ? (difference > 0 ? "slide-up" : "slide-down") : "fade";
    $("lyricsStack").classList.add(animation);
  }
}

function updateLyricsForTime() {
  if (state.lyrics.length === 0) return;
  const index = findLyricIndex(state.lyrics, audio.currentTime * 1000);
  if (index !== state.lyricIndex) renderLyrics(index);
}

function revokeAudioUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

function updateMediaSession(song) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: "ZIGGY PLAYER",
    artwork: [
      { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}

async function loadSong(index, { autoplay = false, direction = null } = {}) {
  const normalizedIndex = normalizeIndex(index);
  const song = SONGS[normalizedIndex];
  const token = ++state.loadToken;
  const wasPlaying = !audio.paused;

  audio.pause();
  audio.currentTime = 0;
  state.songIndex = normalizedIndex;
  state.lyricIndex = -1;
  state.lyrics = [];
  updateTimeline();
  renderReel(direction);
  renderLyrics(-1, false);
  setMessage("読み込み中…");

  try {
    const record = await getSongRecord(song.id);
    if (token !== state.loadToken) return;
    if (!record?.audioBlob || !record?.lyricsText) {
      revokeAudioUrl();
      audio.removeAttribute("src");
      audio.load();
      setMessage("音源と歌詞を登録してください", true);
      openSetup();
      return;
    }

    const parsed = parseLrc(record.lyricsText);
    state.lyrics = parsed.entries;
    revokeAudioUrl();
    state.objectUrl = URL.createObjectURL(record.audioBlob);
    audio.src = state.objectUrl;
    audio.load();
    renderLyrics(-1, false);
    updateMediaSession(song);
    setMessage(autoplay || wasPlaying ? "" : "再生ボタンを押してください");

    if (autoplay || wasPlaying) {
      try {
        await audio.play();
        setMessage("");
      } catch {
        setMessage("再生ボタンを押してください");
      }
    }
  } catch (error) {
    console.error(error);
    setMessage(error.message || "曲を読み込めませんでした。", true);
  }
}

async function changeSong(delta, { autoplay = false } = {}) {
  const direction = delta > 0 ? "next" : "previous";
  await loadSong(state.songIndex + delta, { autoplay, direction });
}

async function togglePlayback() {
  if (!audio.src) {
    openSetup();
    setMessage("先に音源と歌詞を登録してください", true);
    return;
  }

  try {
    if (audio.paused) {
      await audio.play();
      setMessage("");
    } else {
      audio.pause();
    }
  } catch (error) {
    console.error(error);
    setMessage("再生できませんでした。音源を選び直してください。", true);
  }
}

function buildSetupRows() {
  const container = $("setupSongs");
  const template = $("setupSongTemplate");
  container.replaceChildren();

  for (const song of SONGS) {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector(".setup-song");
    article.dataset.songId = song.id;
    fragment.querySelector("h3").textContent = song.title;

    for (const input of fragment.querySelectorAll("input[type=file]")) {
      input.dataset.songId = song.id;
      input.addEventListener("change", handleFileSelection);
    }

    container.appendChild(fragment);
  }
}

async function refreshSetupStatus() {
  let readyCount = 0;
  for (const song of SONGS) {
    const article = document.querySelector(`[data-song-id="${song.id}"]`);
    const record = await getSongRecord(song.id);
    const audioName = article.querySelector('[data-file-name="audio"]');
    const lyricsName = article.querySelector('[data-file-name="lyrics"]');
    audioName.textContent = record?.audioName || "未選択";
    lyricsName.textContent = record?.lyricsName || "未選択";
    audioName.classList.toggle("stored", Boolean(record?.audioBlob));
    lyricsName.classList.toggle("stored", Boolean(record?.lyricsText));
    if (record?.audioBlob && record?.lyricsText) readyCount += 1;
  }

  state.allSongsReady = readyCount === SONGS.length;
  $("storageStatus").textContent = state.allSongsReady ? "2曲を端末内に保存済み" : `${readyCount}/2曲を保存済み`;
  $("closeSetupButton").hidden = !state.allSongsReady;
  return state.allSongsReady;
}

function handleFileSelection(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const key = `${input.dataset.songId}:${input.dataset.kind}`;
  state.pendingFiles.set(key, file);
  const article = input.closest(".setup-song");
  article.querySelector(`[data-file-name="${input.dataset.kind}"]`).textContent = file.name;
  setSetupMessage("");
}

async function decodeLyricsFile(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("shift_jis").decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }
}

async function saveSetup() {
  const button = $("saveSetupButton");
  button.disabled = true;
  setSetupMessage("保存しています…");

  try {
    for (const song of SONGS) {
      const existing = (await getSongRecord(song.id)) || { id: song.id };
      const audioFile = state.pendingFiles.get(`${song.id}:audio`);
      const lyricsFile = state.pendingFiles.get(`${song.id}:lyrics`);
      const record = {
        ...existing,
        id: song.id,
        audioBlob: audioFile || existing.audioBlob,
        audioName: audioFile?.name || existing.audioName,
        lyricsText: lyricsFile ? await decodeLyricsFile(lyricsFile) : existing.lyricsText,
        lyricsName: lyricsFile?.name || existing.lyricsName,
        updatedAt: new Date().toISOString(),
      };

      if (record.lyricsText) parseLrc(record.lyricsText);
      if (audioFile || lyricsFile) await saveSongRecord(record);
    }

    state.pendingFiles.clear();
    const ready = await refreshSetupStatus();
    if (!ready) {
      setSetupMessage("2曲それぞれの音源と歌詞を選んでください。", true);
      return;
    }

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
    setSetupMessage("保存しました。これで次回からすぐ使えます。");
    window.setTimeout(() => {
      closeSetup();
      loadSong(state.songIndex);
    }, 500);
  } catch (error) {
    console.error(error);
    setSetupMessage(error.message || "保存できませんでした。", true);
  } finally {
    button.disabled = false;
  }
}

function openSetup() {
  setupSheet.classList.add("is-open");
  setupSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  refreshSetupStatus().catch((error) => setSetupMessage(error.message, true));
}

function closeSetup() {
  if (!state.allSongsReady) return;
  setupSheet.classList.remove("is-open");
  setupSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function configureMediaSessionActions() {
  if (!("mediaSession" in navigator)) return;
  const actions = {
    play: () => audio.play(),
    pause: () => audio.pause(),
    previoustrack: () => changeSong(-1, { autoplay: true }),
    nexttrack: () => changeSong(1, { autoplay: true }),
    seekto: (details) => {
      if (typeof details.seekTime === "number") audio.currentTime = details.seekTime;
    },
  };

  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some iOS versions expose Media Session but not every action.
    }
  }
}

function attachEvents() {
  $("openSetupButton").addEventListener("click", openSetup);
  $("closeSetupButton").addEventListener("click", closeSetup);
  $("saveSetupButton").addEventListener("click", saveSetup);
  playButton.addEventListener("click", togglePlayback);
  $("previousButton").addEventListener("click", () => changeSong(-1));
  $("nextButton").addEventListener("click", () => changeSong(1));

  seekBar.addEventListener("input", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(seekBar.value) / 1000) * audio.duration;
      updateTimeline();
      updateLyricsForTime();
    }
  });

  audio.addEventListener("timeupdate", () => {
    updateTimeline();
    updateLyricsForTime();
  });
  audio.addEventListener("loadedmetadata", updateTimeline);
  audio.addEventListener("durationchange", updateTimeline);
  audio.addEventListener("play", updatePlayButton);
  audio.addEventListener("pause", updatePlayButton);
  audio.addEventListener("ended", () => changeSong(1, { autoplay: true }));
  audio.addEventListener("error", () => {
    if (audio.src) setMessage("この音源を再生できませんでした。設定から選び直してください。", true);
  });

  reel.addEventListener("wheel", (event) => {
    event.preventDefault();
    changeSong(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  reel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      changeSong(-1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      changeSong(1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePlayback();
    }
  });

  reel.addEventListener("touchstart", (event) => {
    state.touchStartY = event.changedTouches[0].clientY;
  }, { passive: true });
  reel.addEventListener("touchend", (event) => {
    if (state.touchStartY === null) return;
    const distance = state.touchStartY - event.changedTouches[0].clientY;
    state.touchStartY = null;
    if (Math.abs(distance) < 24) return;
    changeSong(distance > 0 ? 1 : -1);
  }, { passive: true });

  setupSheet.addEventListener("click", (event) => {
    if (event.target === setupSheet) closeSetup();
  });

  window.addEventListener("beforeunload", revokeAudioUrl);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Offline setup was unavailable.", error);
  }
}

async function initialize() {
  buildSetupRows();
  attachEvents();
  configureMediaSessionActions();
  renderReel();
  updatePlayButton();
  updateTimeline();
  registerServiceWorker();

  try {
    const ready = await refreshSetupStatus();
    if (ready) {
      await loadSong(0);
    } else {
      openSetup();
    }
  } catch (error) {
    console.error(error);
    setMessage("端末内の保存領域を開けませんでした。", true);
    openSetup();
  }
}

initialize();
