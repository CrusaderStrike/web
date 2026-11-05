// web#44: armory-live suite with ARMORY_SLOT_OPS='set_slot' (Option B, platform#45 / PR platform#46) against a stub
// implementing set_slot / clear_slot. Same stale_base_version, conflicts[], 429 and 400 coverage as the legacy run.
process.env.CS_SLOT_OPS = 'set_slot';
require('./armory-live.e2e.js');
