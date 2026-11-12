# Vault Oracles — an Owlbear Rodeo extension

Vault of Glass–style Oracles for your table. As initiative moves, Oracles appear and sing one at a time.
Your party has **one round** to shoot them **in the order they appeared**. If you miss the window or shoot
the wrong one, the ritual completes and everyone is Marked for Negation.

## Install (one time, ~5 minutes)

Owlbear Rodeo loads extensions from a URL, so these files need to be hosted somewhere. Both options below are free.

**Option A: Netlify Drop (easiest)**
1. Go to https://app.netlify.com/drop and drag this whole folder onto the page.
2. Copy the site URL it gives you, e.g. `https://shiny-oracle-123.netlify.app`.
3. Your install link is that URL + `/manifest.json`.

**Option B: GitHub Pages**
1. Make a new public repo and upload every file in this folder.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Your install link is `https://<you>.github.io/<repo>/manifest.json`.

Then in Owlbear Rodeo go to **Profile → Extensions → Add Extension**, paste the install link, and turn it on in your room.

**Turn tracking:** install the official **Initiative Tracker** extension (by Owlbear Rodeo) from the extension store.
Vault Oracles watches it automatically. If you use a different tracker, switch "Initiative source" to *Manual*
and press **Next turn** whenever a turn ends.

## Running the encounter (GM)

1. **Place Oracle spots.** Pick the **Vault Oracles** tool on the left toolbar and switch to **Place** mode.
   Click the map to add a spot, or click an existing spot to remove it. Spots are hidden from players,
   and you can drag them around with the normal select tool.
2. **Add everyone to the Initiative Tracker** and set the active combatant.
3. Open the **Vault Oracles** panel (top bar) and press **Start ritual**. The first Oracle sings immediately.
4. Each time you hit *Next* in the Initiative Tracker, the next Oracle appears with its own tone.
5. **Players shoot** by choosing the Vault Oracles tool (Shoot mode is the default) and clicking an Oracle.
   As GM you can also right-click an Oracle and choose **Shoot Oracle**, for example after resolving an attack roll.
6. Destroy them all in order to break the ritual. If the window runs out, or someone shoots the wrong Oracle, it's a wipe.

The GM sees small hidden `#1, #2, …` numbers on each Oracle. Players don't, so they have to remember the order.

## Settings

| Setting | What it does |
|---|---|
| Oracles per ritual | How many spots get used (0 = all of them). |
| Spawn order | *Random* each ritual (like the raid) or the order you placed them. |
| Shoot window | *After last spawns*: the round starts when the final Oracle appears. *Per oracle*: each Oracle must die within N rounds of appearing. |
| Rounds to shoot | Size of the window. A round = number of combatants in initiative. |
| Wrong order wipes | Off = a wrong shot just bounces off with a warning. |
| Combatants per round | Only used in Manual mode. |

## Notes
- Each spot has its own pitch, so players can learn the "song". Some browsers block sound in extensions
  until you've interacted with the page; the on-screen notifications always show either way.
- Tested logic: in-order clears, wrong-order wipes, timer expiry in both window modes, manual turns.
- The `_headers` (Netlify) and `vercel.json` files make the host send the CORS header Owlbear needs.
  GitHub Pages already sends it.
