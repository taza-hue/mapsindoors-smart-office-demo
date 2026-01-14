// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve your static demo files (index.html, script.js, style.css, users/credentials.js)
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2));
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(BOOKINGS_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed.bookings || !Array.isArray(parsed.bookings)) return { bookings: [] };
  return parsed;
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(store, null, 2));
}

// GET bookings (optionally by date)
app.get("/api/bookings", (req, res) => {
  const { date } = req.query; // "YYYY-MM-DD"
  const store = readStore();
  const bookings = date ? store.bookings.filter(b => b.date === date) : store.bookings;
  res.json({ bookings });
});

// POST create booking
app.post("/api/bookings", (req, res) => {
  const { locationId, locationName, startMin, endMin, date, username, userType } = req.body || {};

  if (!locationId || !date || typeof startMin !== "number" || typeof endMin !== "number" || !username || !userType) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (!(startMin >= 540 && endMin <= 1020 && startMin < endMin)) { // 9:00-17:00 in minutes
    return res.status(400).json({ error: "Booking must be between 09:00 and 17:00." });
  }

  const store = readStore();

  // Limit: max 5 active bookings per user (for this date; you can make global if you prefer)
  const userActive = store.bookings.filter(b => b.username === username);
  if (userActive.length >= 5) {
    return res.status(409).json({ error: "You can have at most 5 active bookings." });
  }

  // Reject overlap with the user's own bookings (any location) on same date
    const conflicting = store.bookings.find(b =>
    b.date === date &&
    b.username === username &&
    !(endMin <= b.startMin || startMin >= b.endMin)
  );

  if (conflicting) {
    return res.status(409).json({
      error: `This overlaps with your existing booking: ${conflicting.locationName || conflicting.locationId} (${String(conflicting.startMin).padStart(0)}).`
    });
  }

  // Reject overlap on same location and date
  const overlap = store.bookings.some(b =>
    b.date === date &&
    b.locationId === locationId &&
    !(endMin <= b.startMin || startMin >= b.endMin)
  );
  if (overlap) return res.status(409).json({ error: "This time overlaps with an existing booking." });

  const booking = {
    id: crypto.randomUUID(),
    locationId,
    locationName: locationName || "",
    startMin,
    endMin,
    date,
    username,
    userType,
    createdAt: new Date().toISOString()
  };

  store.bookings.push(booking);
  writeStore(store);
  res.json({ booking });
});

// DELETE booking (only owner can delete)
app.delete("/api/bookings/:id", (req, res) => {
  const { id } = req.params;
  const { username, userType } = req.query; // 👈 include userType

  if (!username) return res.status(400).json({ error: "username is required." });
  if (!userType) return res.status(400).json({ error: "userType is required." });

  const requesterIsAdmin = String(userType).toLowerCase() === "admin";

  const store = readStore();
  const idx = store.bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Booking not found." });

  const booking = store.bookings[idx];
  const ownerIsAdmin = String(booking.userType || "").toLowerCase() === "admin";

  // ✅ Owner can always delete their own booking
  const requesterIsOwner = booking.username === username;

  // ✅ Admin can delete bookings of non-admin users
  const adminCanDelete = requesterIsAdmin && !ownerIsAdmin;

  if (!requesterIsOwner && !adminCanDelete) {
    return res.status(403).json({ error: "You do not have permission to remove this booking." });
  }

  store.bookings.splice(idx, 1);
  writeStore(store);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5177;
app.listen(PORT, () => console.log(`Demo server running on http://localhost:${PORT}`));

