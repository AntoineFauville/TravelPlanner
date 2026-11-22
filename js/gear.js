// What to take along. Put together from packing lists of Dometic, Roadsurfer, the RYA, Sunsail and Moorings.
// Car rules change often: they are reminders to check, not legal advice.

const COUNTRY = {
  AT: ['Austria', 'Motorway vignette (sticker or digital)', 'First-aid kit, warning triangle and vest are compulsory', 'Winter tyres in wintry conditions, November to mid April'],
  CH: ['Switzerland', 'Motorway vignette for the whole year', 'Warning triangle within reach of the driver'],
  SI: ['Slovenia', 'E-vignette before you enter', 'Warning vest and triangle'],
  CZ: ['Czechia', 'E-vignette for motorways', 'Lights on all day'],
  SK: ['Slovakia', 'E-vignette for motorways', 'Lights on all day'],
  HU: ['Hungary', 'E-vignette for motorways', 'Triangle, vest and first-aid kit: fines are common'],
  RO: ['Romania', 'Rovinietă (e-vignette) for all main roads', 'Lights on outside towns'],
  FR: ['France', 'Warning triangle and vest', 'Crit’Air sticker if you enter city low-emission zones', 'Card or cash for motorway tolls'],
  IT: ['Italy', 'Old towns are closed to cars (ZTL): park outside', 'Vest when you leave the car on the road', 'Card or cash for motorway tolls'],
  ES: ['Spain', 'Triangle and vest', 'Check low-emission zones in big cities'],
  HR: ['Croatia', 'Motorway tolls', 'A vest for everyone who leaves the car'],
  BA: ['Bosnia and Herzegovina', 'Check that your insurance (green card) is valid', 'Lights on all day'],
  ME: ['Montenegro', 'Check that your insurance (green card) is valid', 'Lights on all day'],
  AL: ['Albania', 'Check that your insurance (green card) is valid', 'Rough roads: good tyres and a spare'],
  MK: ['North Macedonia', 'Check that your insurance (green card) is valid'],
  GR: ['Greece', 'Triangle, first-aid kit and fire extinguisher'],
  PL: ['Poland', 'Lights on all day, all year', 'First-aid kit recommended'],
  LT: ['Lithuania', 'Lights on all day'], LV: ['Latvia', 'Lights on all day'],
  DK: ['Denmark', 'Lights on all day', 'Tolls on the Great Belt and Øresund bridges'],
  SE: ['Sweden', 'Lights on all day', 'Camping freely is a right on foot; with a car or roof tent stay on campsites or ask'],
  NO: ['Norway', 'Register the car for automatic road tolls and ferries', 'Lights on all day', 'Camping freely is a right on foot; with a car or roof tent stay on campsites or ask'],
  GB: ['United Kingdom', 'Passport and UK travel authorisation (ETA)', 'Drive on the left: adjust or mask the headlights'],
  IE: ['Ireland', 'Drive on the left', 'M50 toll around Dublin is paid online'],
  BE: ['Belgium', 'Vest and triangle', 'Register for low-emission zones in Ghent, Antwerp and Brussels'],
  NL: ['Netherlands', 'Check low-emission zones in cities'],
  LU: ['Luxembourg', 'Vest and triangle'],
  DE: ['Germany', 'Triangle, first-aid kit and vest', 'Green sticker for city zones'],
};

const SLEEP = {
  roof: ['Sleeping: roof tent', ['Check the roof load of car and rack', 'Roof tent with ladder, cover on while driving', 'Drive at most about 110 km/h with the tent on', 'Torque wrench to retighten the mounts', 'Mattress topper, sleeping bags, pillows', 'Levelling ramps', 'Shoe bag and small mat by the ladder', 'LED light and head torches', 'Power station or second battery', 'Campsite booked: outside campsites a roof tent counts as wild camping']],
  tent: ['Sleeping: tent', ['Tent, groundsheet, mallet and strong pegs', 'Sleeping mats, bags and pillows', 'Head torches and lantern', 'Tarp and cord', 'Campsite card or booking']],
  hotel: ['Sleeping: rooms', ['Bookings saved offline', 'Parking asked for in old towns']],
};
const COOK = ['Stove, gas and lighter', 'Pot, pan, plates, cutlery, good knife', 'Cool box', 'Water canister and filter', 'Table and two chairs', 'Washing-up kit and rubbish bags'];
const TAG = {
  alpine: ['Mountains', ['Warm layer and rain jacket, even in August', 'Sun cream, sunglasses and hat', 'Mountain pass opening dates checked', 'Walking poles']],
  hike: ['Walking', ['Broken-in walking boots and wool socks', 'Day pack with rain cover', 'Offline maps on the phone', 'Blister plasters']],
  cave: ['Caves', ['Cave visits booked weeks ahead', 'Jumper: caves are 10 to 14 degrees', 'Shoes with grip']],
  coast: ['Coast', ['Windproof jacket', 'Tide times', 'Binoculars']],
  swim: ['Water', ['Swimwear and quick-dry towels', 'Water shoes', 'Dry bag']],
  nordic: ['The north', ['Eye mask for light nights', 'Mosquito net and repellent', 'Warm sleeping bag, down to 0 degrees', 'Full rain clothes']],
  hot: ['Heat', ['Three litres of water each per day in the car', 'Sun shade for the windscreen', 'Light long sleeves']],
  ferry: ['Ferry', ['Ferry booked with the car height including the roof tent', 'Overnight bag for the cabin', 'Seasickness tablets']],
  gravel: ['Rough roads', ['Full-size spare wheel', 'Tyre repair kit and compressor', 'Tow rope']],
  bike: ['Bikes', ['Bike rack and locks', 'Repair kit and pump']],
  winter: ['Winter', ['Snow chains', 'Ice scraper and blanket']],
  camp: null,
};
const CAR = ['Licence, registration and insurance papers', 'Passport or identity card', 'Triangle, vests and first-aid kit', 'Phone holder, charger and offline maps', 'Tyre pressure, oil and washer fluid checked', 'Coins and a credit card'];
const SAIL = [
  ['Papers', ['Original sailing licence and radio certificate', 'Passport and crew list', 'Booking, deposit and insurance papers']],
  ['Clothes', ['Soft bag that folds flat, no hard suitcase', 'Shoes with soft, non-marking soles', 'Windproof jacket and one warm layer', 'Sailing gloves', 'Swimwear, hat with a strap, sunglasses with a cord']],
  ['On board', ['Reef-safe sun cream', 'Seasickness tablets or bands', 'Head torch with red light', 'Dry bag for going ashore', 'Mask and snorkel', 'Power bank and 12 V charger', 'Speaker, cards and a book']],
  ['For learning', ['Logbook for your miles', 'Navigation app with offline charts', 'Knot rope to practise']],
];
const FLY = ['Passport valid six months after the trip', 'Visa and travel advice checked', 'Plug adapter', 'Travel insurance and vaccinations', 'Offline maps and tickets on the phone'];
const CITY = ['Comfortable shoes', 'Museum tickets booked ahead', 'City card or transport app', 'Small day pack'];

// returns [[title, [items]]]
export function packing(t, sleep) {
  if (t.kind === 'sail') return [...SAIL, ['Getting there', FLY.slice(0, 3)]];
  if (t.kind === 'city') return [['City trip', CITY], ['Papers', ['Passport or identity card', 'Health insurance card']]];
  if (t.kind === 'road') {
    const out = [['Car and papers', CAR], SLEEP[sleep] || SLEEP.hotel];
    if (sleep !== 'hotel') out.push(['Cooking', COOK]);
    for (const x of t.tags || []) if (TAG[x]) out.push(TAG[x]);
    for (const c of t.countries || []) if (c !== 'DE' && COUNTRY[c]) out.push([COUNTRY[c][0], COUNTRY[c].slice(1)]);
    return out;
  }
  const out = [['Before you fly', FLY], TAG.hike];
  if (t.rental) out.push(['Rental car', ['Credit card in the driver’s name', 'International driving permit', 'Photos of the car at pick-up', 'Own phone holder and charger', 'Offline maps']]);
  return out;
}
