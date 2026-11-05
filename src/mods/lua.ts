/**
 * Sandboxed Lua scripting (Fengari — a Lua 5.3 VM in JS). Scripts get ONLY the `frontline` API plus
 * base/string/table/math. No io, os, debug, load, require; every call runs under an instruction budget.
 */
// Deep imports avoid fengari's Node-only libs (io/os/debug → readline-sync), which cannot load in a browser.
import lua from 'fengari/src/lua.js';
import lauxlib from 'fengari/src/lauxlib.js';
import lbaselib from 'fengari/src/lbaselib.js';
import lstrlib from 'fengari/src/lstrlib.js';
import ltablib from 'fengari/src/ltablib.js';
import lmathlib from 'fengari/src/lmathlib.js';
import core from 'fengari/src/fengaricore.js';

const to_luastring: (s: string) => any = (core as any).to_luastring;
const lualib: any = { get luaopen_base() { return (lbaselib as any).luaopen_base; }, get luaopen_string() { return (lstrlib as any).luaopen_string; }, get luaopen_table() { return (ltablib as any).luaopen_table; }, get luaopen_math() { return (lmathlib as any).luaopen_math; } };

export interface LuaHost {
  log(mod: string, msg: string): void;
  notify(msg: string): void;
  getBlock(x: number, y: number, z: number): string;
  setBlock(x: number, y: number, z: number, key: string): boolean;
  give(key: string, n: number): boolean;
  playerPos(): [number, number, number];
  time(): number;
  spawnParticles(x: number, y: number, z: number, kind: string, n: number): void;
  play(name: string): void;
  registerCommand(name: string, mod: string, fn: (args: string[]) => string | void): void;
  register(kind: string, mod: string, spec: any): void;
}

const BUDGET = 400000;

export class LuaMod {
  L: any; handlers = new Map<string, number[]>(); errors: string[] = [];
  constructor(public modId: string, private host: LuaHost) {
    const L = (this.L = lauxlib.luaL_newstate());
    for (const [n, f] of [['_G', lualib.luaopen_base], ['string', lualib.luaopen_string], ['table', lualib.luaopen_table], ['math', lualib.luaopen_math]] as any[]) {
      lauxlib.luaL_requiref(L, to_luastring(n), f, 1); lua.lua_pop(L, 1);
    }
    for (const n of ['dofile', 'loadfile', 'load', 'loadstring', 'require', 'collectgarbage', 'rawset', 'rawget', 'setmetatable', 'getmetatable']) { lua.lua_pushnil(L); lua.lua_setglobal(L, to_luastring(n)); }
    this.installApi();
  }
  private jsToLua(v: any, depth = 0) {
    const L = this.L;
    if (v === null || v === undefined) lua.lua_pushnil(L);
    else if (typeof v === 'number') { if (Number.isInteger(v)) lua.lua_pushinteger(L, v); else lua.lua_pushnumber(L, v); }
    else if (typeof v === 'boolean') lua.lua_pushboolean(L, v);
    else if (typeof v === 'string') lua.lua_pushstring(L, to_luastring(v));
    else if (Array.isArray(v) && depth < 4) { lua.lua_createtable(L, v.length, 0); v.forEach((x, i) => { this.jsToLua(x, depth + 1); lua.lua_rawseti(L, -2, i + 1); }); }
    else if (typeof v === 'object' && depth < 4) { lua.lua_createtable(L, 0, 4); for (const [k, x] of Object.entries(v)) { this.jsToLua(x, depth + 1); lua.lua_setfield(L, -2, to_luastring(k)); } }
    else lua.lua_pushnil(L);
  }
  private luaToJs(idx: number, depth = 0): any {
    const L = this.L;
    switch (lua.lua_type(L, idx)) {
      case lua.LUA_TNIL: return null;
      case lua.LUA_TBOOLEAN: return !!lua.lua_toboolean(L, idx);
      case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
      case lua.LUA_TSTRING: return lua.lua_tojsstring(L, idx);
      case lua.LUA_TTABLE: {
        if (depth > 6) return null;
        const abs = lua.lua_absindex(L, idx);
        const obj: Record<string, any> = {}; const arr: any[] = []; let isArr = true, n = 0;
        lua.lua_pushnil(L);
        while (lua.lua_next(L, abs) !== 0) {
          const kt = lua.lua_type(L, -2);
          const val = this.luaToJs(-1, depth + 1);
          if (kt === lua.LUA_TNUMBER) { const k = lua.lua_tonumber(L, -2); arr[k - 1] = val; obj[String(k)] = val; n++; }
          else if (kt === lua.LUA_TSTRING) { isArr = false; obj[lua.lua_tojsstring(L, -2)] = val; }
          lua.lua_pop(L, 1);
        }
        return isArr && n > 0 ? arr : obj;
      }
      default: return null;
    }
  }
  private arm() {
    lua.lua_sethook(this.L, (L: any) => { lauxlib.luaL_error(L, to_luastring('script exceeded its instruction budget')); }, lua.LUA_MASKCOUNT, BUDGET);
  }
  private installApi() {
    const L = this.L, h = this.host, id = this.modId;
    lua.lua_newtable(L);
    const reg = (name: string, fn: (L: any) => number) => { lua.lua_pushcfunction(L, fn); lua.lua_setfield(L, -2, to_luastring(name)); };
    const str = (i: number) => lua.lua_tojsstring(L, i);
    const num = (i: number) => lua.lua_tonumber(L, i);
    reg('log', () => { h.log(id, str(1)); return 0; });
    reg('notify', () => { h.notify(str(1)); return 0; });
    reg('get_block', () => { lua.lua_pushstring(L, to_luastring(h.getBlock(num(1), num(2), num(3)))); return 1; });
    reg('set_block', () => { lua.lua_pushboolean(L, h.setBlock(num(1), num(2), num(3), str(4))); return 1; });
    reg('give', () => { lua.lua_pushboolean(L, h.give(str(1), lua.lua_isnumber(L, 2) ? num(2) : 1)); return 1; });
    reg('player_pos', () => { const p = h.playerPos(); p.forEach((v) => lua.lua_pushnumber(L, v)); return 3; });
    reg('time', () => { lua.lua_pushnumber(L, h.time()); return 1; });
    reg('random', () => { lua.lua_pushnumber(L, Math.random()); return 1; });
    reg('spawn_particles', () => { h.spawnParticles(num(1), num(2), num(3), str(4), lua.lua_isnumber(L, 5) ? num(5) : 10); return 0; });
    reg('play', () => { h.play(str(1)); return 0; });
    reg('on', () => {
      const ev = str(1); lua.lua_pushvalue(L, 2);
      const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
      if (!this.handlers.has(ev)) this.handlers.set(ev, []);
      this.handlers.get(ev)!.push(ref); return 0;
    });
    reg('register_command', () => {
      const name = str(1); lua.lua_pushvalue(L, 2); const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
      h.registerCommand(name, id, (args) => {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref); this.jsToLua(args); this.arm();
        if (lua.lua_pcall(L, 1, 1, 0) !== 0) { const m = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); return 'Lua error: ' + m; }
        const r = lua.lua_type(L, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -1) : undefined; lua.lua_pop(L, 1); return r;
      }); return 0;
    });
    for (const kind of ['block', 'item', 'recipe', 'research', 'challenge', 'structure', 'biome', 'feature', 'lore']) {
      reg('register_' + kind, () => { try { h.register(kind, id, this.luaToJs(1)); } catch (e: any) { return lauxlib.luaL_error(L, to_luastring(String(e.message ?? e))); } return 0; });
    }
    lua.lua_setglobal(L, to_luastring('frontline'));
  }
  run(code: string, chunkName = 'main.lua'): string | null {
    const L = this.L;
    if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== 0) { const m = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); return `${chunkName}: ${m}`; }
    this.arm();
    if (lua.lua_pcall(L, 0, 0, 0) !== 0) { const m = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); return `${chunkName}: ${m}`; }
    return null;
  }
  emit(event: string, payload: any) {
    const hs = this.handlers.get(event); if (!hs) return;
    const L = this.L;
    for (const ref of hs) {
      lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref); this.jsToLua(payload); this.arm();
      if (lua.lua_pcall(L, 1, 0, 0) !== 0) { const m = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); this.errors.push(`[${event}] ${m}`); this.host.log(this.modId, 'Lua error in ' + event + ': ' + m); }
    }
  }
}
