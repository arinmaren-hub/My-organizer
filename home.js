// «Дом» (household inventory) and the generated «Купить» view. Pure functions.
// The inventory is ONE list record with kind 'home'; its items carry stock = 'have' | 'low' | 'out'
// (an item without `stock` is 'have'). «Купить» is not stored: it is the items with stock 'out'.
// Matching is by the `kind` field, never by the list's name, so a personal list that happens to be
// called «Дом» or «Купить» is an ordinary list and is never touched.

export const isHomeList = l => !!l && l.kind === 'home';
const alive = x => !x.deletedAt;

export const homeList = doc => doc.lists.find(l => isHomeList(l) && alive(l)) || null;
export const ordinaryLists = doc => doc.lists.filter(l => alive(l) && !isHomeList(l));
export const stockOf = i => (i.stock === 'low' || i.stock === 'out' ? i.stock : 'have');
export const homeItems = doc => { const h = homeList(doc); return h ? h.items.filter(alive) : []; };
export const buyItems = doc => homeItems(doc).filter(i => stockOf(i) === 'out');
export const STOCK_ORDER = ['have', 'low', 'out'];
