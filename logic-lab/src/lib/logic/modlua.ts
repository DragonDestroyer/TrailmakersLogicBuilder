export const MOD_JSON = `{
  "Name": "Logic Lab Importer",
  "Author": "Trailmakers Logic Lab",
  "Description": "Paste a TML2 export and walk the build one block at a time. The official mod API cannot place or wire logic blocks.",
  "Version": "1.0.0"
}
`;

export const MOD_LUA = `-- Logic Lab Importer
-- Drop this folder in Trailmakers/mods and enable it in the session options.
--
-- What this can do: open a build sheet from a TML2 code pasted out of Logic Lab.
-- What this cannot do: spawn builder blocks or connect them. tm.physics.SpawnObject
-- only places world props. tm.players.SpawnStructure only spawns a finished PNG
-- blueprint. ModBlock can recolor a block that already exists; it has no
-- ConnectInput / PlaceBlock. A mod that actually built the circuit would have
-- to be an unofficial BepInEx plugin against private builder code, and it
-- would break whenever the game updates. This file stays on the supported API.

local NAMES = {
  and = "AND gate", ["or"] = "OR gate", xor = "XOR gate", nor = "NOR gate",
  compare = "Comparison gate", accum = "Accumulator", random = "Randomizer",
  arith = "Arithmetic block", fn = "Function block", aggregate = "Aggregate block",
  display = "Number display", distance = "Distance sensor", altitude = "Altitude sensor",
  speed = "Speed sensor", angle = "Angle sensor", compass = "Compass",
  gravity = "Gravity sensor", position = "Position sensor", aiming = "Aiming sensor",
  hue = "Hue light", servo = "Servo", thruster = "Thruster",
  sender = "RC sender", receiver = "RC receiver",
}

local draft = {}
local steps = {}
local cursor = {}

local function split(str, sep)
  local out = {}
  local start = 1
  local seplen = string.len(sep)
  while true do
    local found = string.find(str, sep, start, true)
    if not found then
      table.insert(out, string.sub(str, start))
      break
    end
    table.insert(out, string.sub(str, start, found - 1))
    start = found + seplen
  end
  return out
end

local function linesOf(text)
  local out = {}
  for line in string.gmatch(text .. "\\n", "(.-)\\n") do
    if line ~= "" then table.insert(out, line) end
  end
  return out
end

local function sheet(text)
  local lines = linesOf(text)
  if string.sub(lines[1] or "", 1, 5) ~= "TML2|" then
    return nil, "Paste a TML2 code from Logic Lab."
  end
  local blocks = {}
  local wires = {}
  local byId = {}
  for i = 2, #lines do
    local p = split(lines[i], "|")
    if p[1] == "B" then
      local block = { id = p[2], kind = p[3], extra = p[6] or "" }
      table.insert(blocks, block)
      byId[block.id] = block
    elseif p[1] == "W" then
      table.insert(wires, { from = p[3], to = p[4] })
    end
  end
  local out = {}
  table.insert(out, "Official API cannot place blocks. Build this by hand.")
  for n, block in ipairs(blocks) do
    local name = NAMES[block.kind] or block.kind
    table.insert(out, n .. ". Place " .. name .. " (" .. block.id .. ").")
    if block.extra ~= "" then
      table.insert(out, "   Settings: " .. block.extra)
    end
    local targets = {}
    for _, w in ipairs(wires) do
      if w.from == block.id then
        local dest = byId[w.to]
        local destName = dest and (NAMES[dest.kind] or dest.kind) or w.to
        table.insert(targets, destName .. " " .. w.to)
      end
    end
    if #targets > 0 then
      table.insert(out, "   Wire its output to " .. table.concat(targets, ", ") .. ".")
    end
  end
  if #blocks == 0 then return nil, "That code has no blocks." end
  return out, nil
end

local function show(playerId)
  local list = steps[playerId]
  local label = "Load a TML2 code, then step through it in build mode."
  if list then
    local i = cursor[playerId] or 1
    label = "(" .. i .. "/" .. #list .. ") " .. list[i]
  end
  if string.len(label) > 220 then label = string.sub(label, 1, 217) .. "..." end
  tm.playerUI.SetUIValue(playerId, "ll_step", label)
  tm.os.Log("Logic Lab [" .. tostring(playerId) .. "] " .. label)
end

local function onText(data)
  draft[data.playerId] = data.value or ""
end

local function onLoad(data)
  local id = data.playerId
  local text = draft[id] or ""
  local list, err = sheet(text)
  if not list then
    tm.playerUI.AddSubtleMessageForPlayer(id, "Logic Lab", err or "Could not read that code.", 4, nil)
    return
  end
  steps[id] = list
  cursor[id] = 1
  show(id)
  tm.playerUI.AddSubtleMessageForPlayer(id, "Logic Lab", #list .. " steps ready", 3, nil)
end

local function onPrev(data)
  local id = data.playerId
  if not steps[id] then return end
  cursor[id] = math.max(1, (cursor[id] or 1) - 1)
  show(id)
end

local function onNext(data)
  local id = data.playerId
  if not steps[id] then return end
  cursor[id] = math.min(#steps[id], (cursor[id] or 1) + 1)
  show(id)
end

local function setup(playerId)
  tm.playerUI.AddUILabel(playerId, "ll_title", "Logic Lab — paste TML2, then step")
  tm.playerUI.AddUIText(playerId, "ll_code", "", onText, nil)
  tm.playerUI.AddUIButton(playerId, "ll_load", "Load code", onLoad, nil)
  tm.playerUI.AddUIButton(playerId, "ll_prev", "Previous step", onPrev, nil)
  tm.playerUI.AddUIButton(playerId, "ll_next", "Next step", onNext, nil)
  tm.playerUI.AddUILabel(playerId, "ll_step", "Waiting for a code.")
end

tm.players.OnPlayerJoined.add(function(player)
  setup(player.playerId)
end)

for _, player in ipairs(tm.players.CurrentPlayers()) do
  setup(player.playerId)
end
`;
