import {access} from 'node:fs/promises';
import {once} from 'node:events';
import {execFile, spawn} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const devicePattern = /^[A-Za-z0-9_.:%[\]-]{1,160}$/;
export const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const error = (code, status = 400) => Object.assign(new Error(code), {status});
export {error as androidError};

export const androidProperties = {
  firebaseDebug:'debug.firebase.analytics.app',
  firebaseLog:'log.tag.FA',
  firebaseServiceLog:'log.tag.FA-SVC',
  tagManagerLog:'log.tag.GoogleTagManager'
};
const allowedProperties = new Set(Object.values(androidProperties));

async function executable() {
  if (process.env.EVENT_ATLAS_ADB) return process.env.EVENT_ATLAS_ADB;
  const windows = process.platform === 'win32';
  const defaults = windows ? process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
    : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Android', 'sdk')
    : path.join(homedir(), 'Android', 'Sdk');
  for (const root of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, defaults]) {
    if (!root) continue;
    const file = path.join(root, 'platform-tools', windows ? 'adb.exe' : 'adb');
    try { await access(file); return file; } catch {}
  }
  return windows ? 'adb.exe' : 'adb';
}

export function createAdb() {
  let adb;
  const disabled = process.env.EVENT_ATLAS_DOCKER === '1';
  const find = () => adb ||= executable();

  async function run(args) {
    if (disabled) throw error('androidDocker', 503);
    try {
      const {stdout} = await exec(await find(), args, {timeout:4500, maxBuffer:524288, windowsHide:true});
      return stdout.trim();
    } catch (err) {
      if (err.code === 'ENOENT') throw error('androidAdbMissing', 503);
      throw error('androidAdbFailed', 502);
    }
  }

  async function devices() {
    return (await run(['devices', '-l'])).split(/\r?\n/).slice(1).flatMap(line => {
      const [serial, state] = line.trim().split(/\s+/);
      if (!devicePattern.test(serial || '') || !['device','unauthorized','offline'].includes(state)) return [];
      return [{serial, state, model: line.match(/\bmodel:(\S+)/)?.[1]?.replaceAll('_',' ') || ''}];
    });
  }
  function onDevice(serial, args) {
    if (typeof serial !== 'string' || !devicePattern.test(serial)) throw error('androidDeviceRequired');
    return run(['-s', serial, ...args]);
  }
  async function packages(serial) {
    const output = await onDevice(serial, ['shell','pm','list','packages','-3']);
    return output.split(/\r?\n/).flatMap(line => {
      const name = line.trim().match(/^package:(\S+)$/)?.[1];
      return name && packagePattern.test(name) ? [name] : [];
    }).sort((a,b) => a.localeCompare(b));
  }
  async function pid(serial, packageName) {
    if (typeof packageName !== 'string' || packageName.length > 240 || !packagePattern.test(packageName)) {
      throw error('androidPackageRequired');
    }
    try {
      const value = (await onDevice(serial, ['shell','pidof',packageName])).split(/\s+/)[0];
      return /^\d+$/.test(value) ? value : null;
    } catch (err) {
      if (err.message !== 'androidAdbFailed') throw err;
      return null;
    }
  }
  const getProperty = (serial, property) => {
    if (!allowedProperties.has(property)) throw error('androidInvalidRequest');
    return onDevice(serial, ['shell','getprop',property]);
  };
  // adb shell joins remote arguments. Quote property values rather than executing device output as shell text.
  const setProperty = (serial, property, value) => {
    if (!allowedProperties.has(property)) throw error('androidInvalidRequest');
    return onDevice(serial, ['shell','setprop',property, "'" + value.replaceAll("'", "'\\''") + "'"]);
  };
  const writeMarker = (serial, marker) => onDevice(serial, ['shell','log','-p','i','-t','EventAtlas',marker]);
  async function stream(serial, diagnostics) {
    const file = await find();
    const tags = ['FA:V','MoEngage:V','EventAtlas:I'];
    if (diagnostics) tags.push('FA-SVC:V','GoogleTagManager:V');
    const child = spawn(file, ['-s',serial,'logcat','-b','main','-T','1','-v','threadtime,epoch','-s',...tags],
      {windowsHide:true, stdio:['ignore','pipe','pipe']});
    try {await once(child,'spawn');} catch {throw error('androidLogcatFailed',502);}
    return child;
  }
  return {devices, packages, pid, getProperty, setProperty, writeMarker, stream};
}
