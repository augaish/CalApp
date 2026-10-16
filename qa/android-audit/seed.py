# Puts the app's saved state into a pulled copy of AsyncStorage's database:
# python3 seed.py <RKStorage> <state.json>
import sqlite3, sys

db, state = sys.argv[1], sys.argv[2]
con = sqlite3.connect(db)
con.execute("CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
con.execute("INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES (?, ?)", ("calapp-store", open(state).read()))
con.commit()
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.close()
