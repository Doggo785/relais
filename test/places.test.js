import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, searchStations, iconFor, parseShared, coordsFromMapsUrl } from '../www/places.js';

const stations = [
  { id: '1', name: 'Meriadeck', lat: 44.838, lon: -0.584 },
  { id: '2', name: 'Place Mériadeck Nord', lat: 44.84, lon: -0.58 },
  { id: '3', name: 'Quinconces', lat: 44.845, lon: -0.574 },
];

test('recherche de bornes insensible aux accents, préfixe en premier', () => {
  assert.equal(norm('Mériadeck  Nord'), 'meriadeck nord');
  assert.deepEqual(searchStations(stations, 'mériad').map(s => s.name), ['Meriadeck', 'Place Mériadeck Nord']);
  assert.deepEqual(searchStations(stations, 'q'), []); // trop court
});

test('icône selon le type OpenStreetMap', () => {
  assert.equal(iconFor('amenity:school'), '🎓');
  assert.equal(iconFor('railway:tram_stop'), '🚋');
  assert.equal(iconFor('tourism:artwork'), '📍');
  assert.equal(iconFor('shop:garden_centre'), '🛍️');
});

test('texte partagé par Google Maps : nom, adresse et lien', () => {
  assert.deepEqual(parseShared('Darwin Ecosystème\n87 Quai des Queyries, 33100 Bordeaux\n\nhttps://maps.app.goo.gl/AbCd123'), {
    name: 'Darwin Ecosystème', query: 'Darwin Ecosystème, 87 Quai des Queyries, 33100 Bordeaux', url: 'https://maps.app.goo.gl/AbCd123',
  });
  assert.deepEqual(parseShared('https://maps.app.goo.gl/AbCd123'), { name: null, query: null, url: 'https://maps.app.goo.gl/AbCd123' });
});

test('coordonnées dans les URL Google Maps', () => {
  assert.deepEqual(coordsFromMapsUrl('https://www.google.com/maps/place/Darwin/@44.8496,-0.5615,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d44.8495!4d-0.5609'), [44.8495, -0.5609]);
  assert.deepEqual(coordsFromMapsUrl('https://www.google.com/maps/@44.84,-0.57,15z'), [44.84, -0.57]);
  assert.deepEqual(coordsFromMapsUrl('https://maps.google.com/?q=44.8401,-0.5702'), [44.8401, -0.5702]);
  assert.deepEqual(coordsFromMapsUrl('https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FX%2F%4044.8,-0.5,17z'), [44.8, -0.5]);
  assert.equal(coordsFromMapsUrl('https://maps.app.goo.gl/AbCd123'), null);
});
