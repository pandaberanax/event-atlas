import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {createAndroidAudit} from '../android-audit.mjs';
import {androidProperties} from '../android-adb.mjs';
import {logEntry, firebaseLog, moengageLog} from '../android-log.mjs';

const loggedAt = 1760000000000;
const row = (message,pid='345',tag='FA',time=loggedAt) =>
  (time / 1000).toFixed(3) + '    ' + pid + '   678 D ' + tag + '     : ' + message;

function mockAdb() {
  const properties = {
    [androidProperties.firebaseLog]:'INFO',
    [androidProperties.firebaseDebug]:'com.example.previous',
    [androidProperties.firebaseServiceLog]:'',
    [androidProperties.tagManagerLog]:'WARN'
  };
  let process;
  return {
    devices:async () => [{serial:'emulator-5554',state:'device'}],
    packages:async () => ['com.example.shop'],
    pid:async () => '345',
    properties,
    getProperty:async (_, property) => properties[property],
    setProperty:async (_, property, value) => {properties[property] = value;},
    async stream(_, diagnostics) {
      this.streamDiagnostics = diagnostics;
      process = new EventEmitter();
      process.stdout = new PassThrough();
      process.kill = () => process.stdout.end();
      process.stdout.write(row('Logging event (FE): old_event') + '\n');
      return process;
    },
    async writeMarker(_,marker) {
      process.stdout.write(row(marker,'1','EventAtlas',loggedAt+100) + '\n');
    },
    send(line) {process.stdout.write(line + '\n');},
    disconnect() {process.emit('exit',1);}
  };
}

test('Firebase Logcat parser preserves event names, aliases and nested parameters', () => {
  const event = firebaseLog(logEntry(row('Logging event (FE): screen_view(_vs), Bundle[{ga_screen_class(_sc)=Checkout, product=Small, red, quantity=2, items=[Bundle[{item_id=42, token=secret}], Bundle[{item_id=43}]], access_token=secret}]')));
  assert.equal(event.name,'screen_view(_vs)');
  assert.equal(event.evidence.loggedAt,loggedAt);
  assert.deepEqual(event.evidence.parameters,{'ga_screen_class(_sc)':'Checkout',product:'Small, red',quantity:'2',
    items:[{item_id:'42',token:'[redacted]'},{item_id:'43'}],access_token:'[redacted]'});
  assert.equal(event.evidence.parametersTruncated,false);
  const partial = firebaseLog(logEntry(row('Logging event (FE): checkout, Bundle[{currency=IDR, title=part')));
  assert.deepEqual(partial.evidence.parameters,{currency:'IDR'});
  assert.equal(partial.evidence.parametersTruncated,true);
  assert.equal(firebaseLog(logEntry(row('Upload response received'))),null);
});

test('MoEngage parses the SDK notification and preserves complete attributes even if the log is cut off', () => {
  const prefix = 'sdk Core_ActionNotifier onEventTracked() : payload: {eventName=view_listing, eventAttributes=';
  const event = moengageLog(logEntry(row(prefix + '{"id":"ABC","details":{"currency":"IDR","access_token":"secret"},"active":true}}','345','MoEngage')));
  assert.equal(event.name,'view_listing');
  assert.equal(event.platform,'moengage');
  assert.equal(event.source,'moengage-logcat');
  assert.deepEqual(event.evidence.parameters,{id:'ABC',details:{currency:'IDR',access_token:'[redacted]'},active:true});
  assert.equal(event.evidence.parametersTruncated,false);
  const partial = moengageLog(logEntry(row(prefix + '{"id":"ABC","title":"cut here','345','MoEngage')));
  assert.deepEqual(partial.evidence.parameters,{id:'ABC'});
  assert.equal(partial.evidence.parametersTruncated,true);
  assert.equal(moengageLog(logEntry(row('Core_EventHandler trackEvent() : something','345','MoEngage'))),null);
  assert.equal(moengageLog(logEntry(row(prefix + '{}','345','FA'))),null);
});

test('Android event capture preserves long strings present in Logcat', () => {
  const value = '🧪'.repeat(750);
  const firebase = firebaseLog(logEntry(row('Logging event (FE): checkout, Bundle[{description=' + value + '}]')));
  const moengage = moengageLog(logEntry(row('Core_ActionNotifier onEventTracked() : {eventName=checkout, eventAttributes='
    + JSON.stringify({description:value}) + '}','345','MoEngage')));
  for (const event of [firebase,moengage]) {
    assert.equal(event.evidence.parameters.description,value);
    assert.equal(event.evidence.parametersTruncated,false);
  }
});

test('Android capture keeps session boundary, app process and marker context, then restores logging', async () => {
  const adb = mockAdb();
  const audit = createAndroidAudit(adb);
  await assert.rejects(audit.start({device:'emulator-5554',packageName:'com.example; ls'}),/androidPackageRequired/);
  const {id} = await audit.start({device:'emulator-5554',packageName:'com.example.shop'});
  assert.equal(adb.properties[androidProperties.firebaseLog],'VERBOSE');
  assert.equal(adb.properties[androidProperties.firebaseDebug],'com.example.previous');
  assert.equal(adb.streamDiagnostics,false);
  await assert.rejects(audit.start({device:'emulator-5554',packageName:'com.example.shop'}),/androidBusy/);
  audit.mark({id,type:'screen',label:'Checkout'});
  audit.mark({id,type:'tap',label:'Pay'});
  adb.send(row('Logging event (FE): another_app','789','FA',loggedAt+110));
  adb.send(row('Logging event (FE): old_buffer','345','FA',loggedAt+40));
  adb.send(row('Logging event (FE): begin_checkout, Bundle[{currency=IDR}]','345','FA',loggedAt+120));
  adb.send(row('Core_ActionNotifier onEventTracked() : payload: {eventName=view_listing, eventAttributes={"listing_id":"ABC"}}','345','MoEngage',loggedAt+130));
  assert.equal(audit.view(id,2).rows[0].name,'begin_checkout');
  const {rows} = audit.report();
  assert.deepEqual(rows.map(item => item.type),['screen','tap','event','event']);
  assert.equal(rows[2].screen,'Checkout');
  assert.equal(rows[2].element.text,'Pay');
  assert.equal(rows[2].evidence.parameters.currency,'IDR');
  assert.equal(rows[3].platform,'moengage');
  assert.equal(rows[3].evidence.logMessage,undefined);
  assert.equal(audit.view().eventCount,2);
  assert.equal(audit.view().markerCount,2);
  await audit.stop(id);
  assert.equal(audit.report().status,'completed');
  assert.equal(adb.properties[androidProperties.firebaseLog],'INFO');
  assert.throws(() => audit.mark({id,type:'tap',label:'Late'}),/androidSessionEnded/);
});

test('Android DebugView and diagnostic options scope raw logs and restore changed settings', async () => {
  const adb = mockAdb();
  const original = {...adb.properties};
  const audit = createAndroidAudit(adb);
  const {id} = await audit.start({device:'emulator-5554',packageName:'com.example.shop',firebaseDebug:true,diagnostics:true});
  assert.equal(adb.properties[androidProperties.firebaseDebug],'com.example.shop');
  assert.equal(adb.properties[androidProperties.firebaseServiceLog],'VERBOSE');
  assert.equal(adb.properties[androidProperties.tagManagerLog],'VERBOSE');
  assert.equal(adb.streamDiagnostics,true);
  adb.send(row('other process','789','FA-SVC',loggedAt+110));
  adb.send(row('before start','345','GoogleTagManager',loggedAt+40));
  adb.send(row('container loaded','345','GoogleTagManager',loggedAt+110));
  const event = 'Logging event (FE): checkout, Bundle[{currency=IDR}]';
  adb.send(row(event,'345','FA',loggedAt+120));
  adb.send(row('  sdk continuation','345','MoEngage',loggedAt+130));
  adb.send(row('service log','345','FA-SVC',loggedAt+140));
  const report = audit.report();
  assert.equal(report.eventCount,1);
  assert.equal(report.diagnosticCount,3);
  assert.equal(report.markerCount,0);
  assert.deepEqual(report.rows.map(item => [item.type,item.platform,item.evidence.logMessage]),[
    ['diagnostic','gtm','container loaded'], ['event','ga4',event],
    ['diagnostic','moengage','  sdk continuation'], ['diagnostic','ga4','service log']
  ]);
  await audit.stop(id);
  assert.deepEqual(adb.properties,original);
});

test('a failed Android debug setup rolls back properties already applied', async () => {
  const adb = mockAdb();
  const original = {...adb.properties};
  const setProperty = adb.setProperty;
  adb.setProperty = async (device, property, value) => {
    await setProperty(device,property,value);
    if (property === androidProperties.tagManagerLog && value === 'VERBOSE') throw Error('test setprop failure');
  };
  const audit = createAndroidAudit(adb);
  await assert.rejects(audit.start({device:'emulator-5554',packageName:'com.example.shop',firebaseDebug:true,diagnostics:true}),
    /test setprop failure/);
  assert.deepEqual(adb.properties,original);
  assert.equal(audit.view().status,'idle');
});

test('an interrupted log stream releases the session and restores the property', async () => {
  const adb = mockAdb();
  const audit = createAndroidAudit(adb);
  await audit.start({device:'emulator-5554',packageName:'com.example.shop'});
  adb.disconnect();
  await delay(0);
  assert.equal(audit.report().status,'interrupted');
  assert.equal(adb.properties[androidProperties.firebaseLog],'INFO');
});
