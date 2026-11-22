// German UI boundary for Supabase/PostgREST errors. Do not display raw backend text.
const rules = [
  [/row.level.security|permission denied|insufficient privilege|not authorized|not authenticated|jwt|invalid token|42501/i,'Keine Berechtigung. Bitte erneut anmelden oder den Zugriff prüfen.'],
  [/invoice|invoiced|abgerechnet|locked/i,'Diese Stunde ist bereits abgerechnet und kann nicht verändert werden.'],
  [/idempotenc|replay|payload.*chang|request.*key/i,'Diese Anfrage wurde bereits mit anderen Angaben verwendet. Bitte erneut speichern.'],
  [/duplicate|unique constraint|23505/i,'Ein entsprechender Eintrag existiert bereits. Bitte die Angaben prüfen.'],
  [/inactive|not active|paused|ended/i,'Der Schüler ist an diesem Datum nicht aktiv. Bitte den Status prüfen.'],
  [/foreign key|23503/i,'Ein verknüpfter Datensatz fehlt. Bitte die Auswahl prüfen.'],
  [/check constraint|23514|invalid.*(status|date|rate|minute)|out of range/i,'Ungültige Eingabe. Bitte Datum, Status, Dauer und Preis prüfen.'],
  [/network|failed to fetch|fetch failed|timeout|connection|503|502/i,'Verbindung fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.'],
  [/not found|pgrst116|no rows/i,'Der angeforderte Eintrag wurde nicht gefunden. Bitte die Ansicht aktualisieren.']
];
export function germanBackendError(error){
  if(typeof error==='string' && !error)return 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.';
  const message=typeof error==='string'?error:String(error?.message||'');
  const code=String(error?.code||'');
  if(!code && /^(Bitte |Eine vorhandene Stunde|Speichern wurde nicht bestätigt|Der Schüler |Stunde |Keine Schülerdaten)/.test(message))return message;
  const text=[code,message,String(error?.details||''),String(error?.hint||'')].join(' ');
  for(const [pattern,label] of rules)if(pattern.test(text))return label;
  return 'Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen. Falls der Fehler bleibt, den Support kontaktieren.';
}
