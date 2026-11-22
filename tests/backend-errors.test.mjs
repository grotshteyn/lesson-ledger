import test from 'node:test';
import assert from 'node:assert/strict';
import {germanBackendError} from '../frontend/backend-errors.js';

test('backend errors are translated without leaking English SQL messages',()=>{
 assert.match(germanBackendError({code:'42501',message:'permission denied for table lessons'}),/Keine Berechtigung/);
 assert.match(germanBackendError({message:'lesson is invoiced and locked'}),/bereits abgerechnet/);
 assert.match(germanBackendError({message:'idempotency replay payload changed'}),/bereits mit anderen Angaben/);
 assert.match(germanBackendError({code:'23505',message:'duplicate key value violates unique constraint'}),/existiert bereits/);
 assert.match(germanBackendError({message:'Failed to fetch'}),/Verbindung fehlgeschlagen/);
});
test('unknown backend details are not shown and German client validation survives',()=>{
 assert.doesNotMatch(germanBackendError({message:'internal secret SQL debug detail'}),/secret|SQL debug/);
 assert.equal(germanBackendError(Error('Bitte Schüler und Datum prüfen.')),'Bitte Schüler und Datum prüfen.');
});
