// Pravi otisak lozinke za "sajt u izradi": node tools/gate-hash.mjs <lozinka>
// Upiši { salt, rounds, hash } u "gate" u data/site.json. Lozinka se nigde ne čuva.
import { randomBytes, pbkdf2Sync } from 'node:crypto';
const pw = process.argv[2];
if (!pw) { console.error('Upotreba: node tools/gate-hash.mjs <lozinka>'); process.exit(1); }
const salt = randomBytes(12).toString('hex'), rounds = 300000;
console.log(JSON.stringify({ on: true, salt, rounds, hash: pbkdf2Sync(pw, salt, rounds, 32, 'sha256').toString('hex') }, null, 2));
