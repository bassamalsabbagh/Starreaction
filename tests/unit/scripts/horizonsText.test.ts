import { describe, expect, it } from 'vitest';
import {
  parseCalendarUt,
  parseCsvAzElRow,
  parseHorizonsHeader,
  parseManualRows,
  tableRows,
} from '../../../scripts/lib/horizonsText';

// Shortened copies of real Horizons output (header lines and rows as Horizons prints them).
const API_REPLY = `*******************************************************************************
Target body name: Sun (10)                        {source: DE441}
Center body name: Moon (301)                      {source: DE441}
Step-size       : 10 minutes
Center geodetic : 1.44, -80.13, 0.0               {E-lon(deg),Lat(deg),Alt(km)}
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),
$$SOE
 2026-Nov-01 00:00,*,i, 283.252199,     3.761291,
 2026-Nov-01 00:10, , , 283.168724,    -0.747256,
$$EOE
`;

const MANUAL_SUN = `Target body name: Sun (10)                        {source: DE441}
Center body name: Moon (301)                      {source: DE441}
Center geodetic : 61.81, 18.56, -4.41967E-13      {E-lon(deg),Lat(deg),Alt(km)}
 Date__(UT)__HR:MN     R.A._____(ICRF)_____DEC  R.A.__(a-apparent)__DEC  dRA*cosD d(DEC)/dt  Azi____(a-app)___Elev  dAZ*cosE d(ELV)/dt  Sky_motion  Sky_mot_PA  RelVel-ANG  Lun_Sky_Brt  sky_SNR
$$SOE
 2026-Nov-13 00:00 *i  15 10 48.77 -17 45 58.0  11 13 20.48 -01 33 23.7  147.5410  -0.61753   95.706425  11.802260     10.10     28.75   2.4590388   90.239810   0.3225204         n.a.     n.a.
 2026-Nov-14 00:00  i  15 14 48.41 -18 01 45.4  11 17 17.15 -01 33 27.0  148.2587  -0.63108  100.104617  -3.248135     10.92     28.44   2.4710006   90.243883   0.5633366         n.a.     n.a.
$$EOE
`;

const MANUAL_EARTH = `Target body name: Earth (399)                     {source: DE441}
Center body name: Moon (301)                      {source: DE441}
 Date__(UT)__HR:MN     R.A._____(ICRF)_____DEC    APmag   S-brt             delta      deldot     S-O-T /r     S-T-O  Sky_motion  Sky_mot_PA  RelVel-ANG  Lun_Sky_Brt  sky_SNR
$$SOE
 2026-Nov-13 00:00 *   06 06 06.64 +27 42 49.6  -16.541   2.113  0.00270953222364   0.0081948  138.5924 /L   41.3040   29.596105   93.900154   0.4885733         n.a.     n.a.
 2026-Dec-05 00:00     01 33 57.47 +14 56 03.9  -16.540   2.143  0.00263717114644   0.0417716  134.4495 /T   45.4409   31.231831   87.124743   2.4063530         n.a.     n.a.
$$EOE
`;

describe('parseHorizonsHeader', () => {
  it('reads the target, the observer body, the site and the step', () => {
    expect(parseHorizonsHeader(API_REPLY)).toEqual({
      target: 'Sun (10)',
      center: 'Moon (301)',
      centerGeodetic: { lonEast: 1.44, lat: -80.13, altKm: 0 },
      stepSize: '10 minutes',
    });
  });

  it('gives null for lines that are not there', () => {
    expect(parseHorizonsHeader('nothing here')).toEqual({
      target: null,
      center: null,
      centerGeodetic: null,
      stepSize: null,
    });
  });
});

describe('parseCalendarUt', () => {
  it('reads Horizons calendar times as UTC', () => {
    expect(parseCalendarUt('2026-Nov-13 00:00')).toBe(Date.UTC(2026, 10, 13));
    expect(parseCalendarUt(' 2027-Dec-31 23:50')).toBe(Date.UTC(2027, 11, 31, 23, 50));
  });

  it('refuses anything else', () => {
    expect(parseCalendarUt('2026-11-13 00:00')).toBeNaN();
    expect(parseCalendarUt('2026-Foo-13 00:00')).toBeNaN();
  });
});

describe('API CSV rows', () => {
  it('reads time, flags, azimuth and elevation', () => {
    const rows = tableRows(API_REPLY).map(parseCsvAzElRow);
    expect(rows).toEqual([
      {
        t: Date.UTC(2026, 10, 1, 0, 0),
        daylight: true,
        interferer: true,
        azimuth: 283.252199,
        elevation: 3.761291,
      },
      {
        t: Date.UTC(2026, 10, 1, 0, 10),
        daylight: false,
        interferer: false,
        azimuth: 283.168724,
        elevation: -0.747256,
      },
    ]);
  });

  it('returns null for a row it cannot read', () => {
    expect(parseCsvAzElRow(' 2026-Nov-01 00:00,*,i, n.a., 3.7,')).toBeNull();
    expect(parseCsvAzElRow('garbage')).toBeNull();
  });

  it('finds no rows without the $$SOE/$$EOE markers', () => {
    expect(tableRows('no table')).toEqual([]);
  });
});

describe('parseManualRows', () => {
  it('reads the flags and, when present, the Azi/Elev columns', () => {
    expect(parseManualRows(MANUAL_SUN)).toEqual([
      {
        t: Date.UTC(2026, 10, 13),
        daylight: true,
        interferer: true,
        azEl: { azimuth: 95.706425, elevation: 11.80226 },
      },
      {
        t: Date.UTC(2026, 10, 14),
        daylight: false,
        interferer: true,
        azEl: { azimuth: 100.104617, elevation: -3.248135 },
      },
    ]);
  });

  it('reads the flags of an export without Azi/Elev, blank flags included', () => {
    expect(parseManualRows(MANUAL_EARTH)).toEqual([
      { t: Date.UTC(2026, 10, 13), daylight: true, interferer: false, azEl: null },
      { t: Date.UTC(2026, 11, 5), daylight: false, interferer: false, azEl: null },
    ]);
  });
});
