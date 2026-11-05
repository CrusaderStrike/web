// web#44: armory-live suite with the ARMORY_SLOT_OPS='legacy' rollback switch (Option A: remove_item + add_item) against a
// pre-platform#46 stub that rejects set_slot / clear_slot. The default armory-live run covers the shipped 'set_slot' mode.
process.env.CS_SLOT_OPS = 'legacy';
require('./armory-live.e2e.js');
