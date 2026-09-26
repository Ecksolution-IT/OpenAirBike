import { describe, expect, it } from 'vitest';
import { fromHex } from '../src/protocol/ftms/bytes';
import { encodeIndoorBikeData, parseIndoorBikeData, type IndoorBikeData } from '../src/protocol/ftms/indoorBikeData';

describe('parseIndoorBikeData', () => {
  it('parses the mandatory Instantaneous Speed when More Data is 0', () => {
    // flags 0x0000, speed 3000 → 30.00 km/h
    expect(parseIndoorBikeData(fromHex('00 00 b8 0b'))).toEqual({ moreData: false, instantaneousSpeedKmh: 30 });
  });

  it('parses a typical air-bike record in field order', () => {
    // flags: cadence | distance | power | expended energy | elapsed time = 0x0954
    const bytes = fromHex(
      [
        '54 09', // flags
        'f6 09', // speed 25.50 km/h
        '79 00', // cadence 121 * 0.5 = 60.5 rpm
        'd2 04 00', // distance 1234 m
        'fa 00', // power 250 W
        '2a 00 ff ff ff', // energy: total 42 kcal, per hour / per minute not available
        '2c 01', // elapsed 300 s
      ].join(' '),
    );
    expect(parseIndoorBikeData(bytes)).toEqual({
      moreData: false,
      instantaneousSpeedKmh: 25.5,
      instantaneousCadenceRpm: 60.5,
      totalDistanceM: 1234,
      instantaneousPowerW: 250,
      totalEnergyKcal: 42,
      elapsedTimeS: 300,
    });
  });

  it('parses every field', () => {
    const bytes = fromHex(
      [
        'fe 1f', // all flags except More Data
        'e8 03', // speed 10.00
        'd0 07', // avg speed 20.00
        'b4 00', // cadence 90
        '78 00', // avg cadence 60
        '40 42 0f', // distance 1,000,000 m (uint24)
        'fb ff', // resistance -5 (sint16)
        '9c ff', // power -100 W (sint16)
        '2c 01', // avg power 300 W
        '10 27 58 02 0a', // energy 10000 kcal, 600 kcal/h, 10 kcal/min
        '96', // heart rate 150
        '41', // MET 6.5
        '10 0e', // elapsed 3600 s
        '3c 00', // remaining 60 s
      ].join(' '),
    );
    expect(parseIndoorBikeData(bytes)).toEqual({
      moreData: false,
      instantaneousSpeedKmh: 10,
      averageSpeedKmh: 20,
      instantaneousCadenceRpm: 90,
      averageCadenceRpm: 60,
      totalDistanceM: 1_000_000,
      resistanceLevel: -5,
      instantaneousPowerW: -100,
      averagePowerW: 300,
      totalEnergyKcal: 10000,
      energyPerHourKcal: 600,
      energyPerMinuteKcal: 10,
      heartRateBpm: 150,
      metabolicEquivalent: 6.5,
      elapsedTimeS: 3600,
      remainingTimeS: 60,
    });
  });

  it('omits Instantaneous Speed when More Data is 1', () => {
    // flags: More Data | cadence, cadence 120 → 60 rpm
    expect(parseIndoorBikeData(fromHex('05 00 78 00'))).toEqual({ moreData: true, instantaneousCadenceRpm: 60 });
  });

  it('ignores RFU flag bits and trailing unrecognized octets (FTMP §4.4.7)', () => {
    // RFU bit 15 set, plus two extra bytes at the end
    expect(parseIndoorBikeData(fromHex('00 80 b8 0b de ad'))).toEqual({ moreData: false, instantaneousSpeedKmh: 30 });
  });

  it('treats a heart rate of 0 as unavailable', () => {
    // flags: heart rate (bit 9)
    expect(parseIndoorBikeData(fromHex('00 02 00 00 00')).heartRateBpm).toBeUndefined();
  });

  it('returns the readable fields of a truncated payload', () => {
    // flags announce cadence and power, but power is missing
    expect(parseIndoorBikeData(fromHex('44 00 b8 0b 78 00'))).toEqual({
      moreData: false,
      instantaneousSpeedKmh: 30,
      instantaneousCadenceRpm: 60,
      truncated: true,
    });
    expect(parseIndoorBikeData(fromHex('00'))).toEqual({ moreData: false, truncated: true });
  });

  it('accepts a DataView with an offset into a larger buffer', () => {
    const buffer = fromHex('ff ff 00 00 b8 0b').buffer;
    expect(parseIndoorBikeData(new DataView(buffer, 2)).instantaneousSpeedKmh).toBe(30);
  });
});

describe('encodeIndoorBikeData', () => {
  it('round-trips through the parser', () => {
    const record: IndoorBikeData = {
      moreData: false,
      instantaneousSpeedKmh: 31.25,
      instantaneousCadenceRpm: 72.5,
      totalDistanceM: 8400,
      instantaneousPowerW: 612,
      totalEnergyKcal: 241,
      heartRateBpm: 148,
      elapsedTimeS: 1458,
    };
    expect(parseIndoorBikeData(encodeIndoorBikeData(record))).toEqual(record);
  });

  it('encodes unavailable energy sub-fields with the special values', () => {
    const bytes = encodeIndoorBikeData({ moreData: true, totalEnergyKcal: 5 });
    expect(Array.from(bytes)).toEqual([0x01, 0x01, 0x05, 0x00, 0xff, 0xff, 0xff]);
  });
});
