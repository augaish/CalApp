// The App Store Connect .p8 key works however it lands in a Railway
// variable: as downloaded, on one line with \n, with its line breaks turned
// into spaces, in quotes, with Windows line ends, or without BEGIN/END.
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { appleKeyId, appleKeyPem, appleToken } from '../server/src/store-offers';

let fails = 0;
const check = (l: string, c: boolean, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const body = p8.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
const variants: [string, string][] = [
  ['as downloaded', p8],
  ['one line with \\n', p8.replace(/\n/g, '\\n')],
  ['line breaks turned into spaces', p8.replace(/\n/g, ' ')],
  ['in quotes', `"${p8}"`],
  ['Windows line ends', p8.replace(/\n/g, '\r\n')],
  ['without BEGIN and END', body],
];
process.env.ASC_KEY_ID = 'KEY123';
process.env.ASC_ISSUER_ID = 'issuer-1';
for (const [name, value] of variants) {
  process.env.ASC_PRIVATE_KEY = value;
  let ok = false;
  let err = '';
  try {
    const [h, p, sig] = appleToken().split('.');
    const v = createVerify('SHA256');
    v.update(`${h}.${p}`);
    ok = v.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  } catch (e) {
    err = String(e);
  }
  check(`signs with the key ${name}`, ok, err);
}
check('re-wrapped as PKCS#8 in 64-character lines', appleKeyPem(body).split('\n').slice(1, -2).every((l) => l.length <= 64));
check('Key ID from the file name', appleKeyId('AuthKey_7q2xabcd12.p8') === '7Q2XABCD12' && appleKeyId(' 7Q2XABCD12 ') === '7Q2XABCD12');
process.env.ASC_PRIVATE_KEY = p8;
const claims = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const team = claims(appleToken(Date.now(), 'team'));
const indiv = claims(appleToken(Date.now(), 'individual'));
check('team key: iss, no sub', team.iss === 'issuer-1' && !team.sub && team.aud === 'appstoreconnect-v1' && team.exp - team.iat <= 1200);
check('individual key: sub "user", no iss', indiv.sub === 'user' && !indiv.iss && indiv.aud === 'appstoreconnect-v1');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
