// Field specs for the admin lookup screens (S24). Keys mirror the Zod schemas in src/lib/services/lookups.ts.
export interface FieldSpec { name: string; label: string; kind: 'text' | 'select' | 'bool'; required?: boolean; options?: string[]; hint?: string }
export const LOOKUP_LABELS: Record<string, string> = { customers: 'Customers', suppliers: 'Suppliers', carriers: 'Carriers', parts: 'Parts', locations: 'Locations', 'reason-codes': 'Reason codes', users: 'Users' };
export const LOOKUP_ORDER = ['parts', 'customers', 'suppliers', 'carriers', 'locations', 'reason-codes', 'users'];
export const EDITABLE = LOOKUP_ORDER.filter((t) => t !== 'users');

export const SPECS: Record<string, FieldSpec[]> = {
  customers: [
    { name: 'code', label: 'Code', kind: 'text', required: true, hint: 'Letters, digits, hyphens (max 20).' }, { name: 'name', label: 'Name', kind: 'text', required: true },
    { name: 'ship_to_city', label: 'Ship-to city', kind: 'text' }, { name: 'ship_to_state', label: 'Ship-to state', kind: 'text' }, { name: 'active', label: 'Active', kind: 'bool' },
  ],
  suppliers: [{ name: 'code', label: 'Code', kind: 'text', required: true }, { name: 'name', label: 'Name', kind: 'text', required: true }, { name: 'active', label: 'Active', kind: 'bool' }],
  carriers: [{ name: 'name', label: 'Name', kind: 'text', required: true }, { name: 'mode', label: 'Mode', kind: 'select', required: true, options: ['Parcel', 'LTL', 'Truckload', 'Pickup'] }, { name: 'active', label: 'Active', kind: 'bool' }],
  parts: [
    { name: 'part_number', label: 'Part number', kind: 'text', required: true, hint: 'Must end with -<revision>, for example CRC-2041-B.' }, { name: 'revision', label: 'Revision', kind: 'text', required: true },
    { name: 'description', label: 'Description', kind: 'text' }, { name: 'unit_of_measure', label: 'Unit of measure', kind: 'text' },
    { name: 'abc_class', label: 'ABC class', kind: 'select', required: true, options: ['A', 'B', 'C'] }, { name: 'packaging_instruction_ref', label: 'Packaging instruction', kind: 'text' },
    { name: 'requires_coc', label: 'Requires certificate of conformance', kind: 'bool' }, { name: 'active', label: 'Active', kind: 'bool' },
  ],
  locations: [{ name: 'code', label: 'Code', kind: 'text', required: true }, { name: 'type', label: 'Type', kind: 'select', required: true, options: ['Stock', 'Receiving', 'Hold', 'Shipping', 'FG'] }, { name: 'active', label: 'Active', kind: 'bool' }],
  'reason-codes': [
    { name: 'category', label: 'Category', kind: 'select', required: true, options: ['late', 'hold', 'adjust', 'scrap'] }, { name: 'code', label: 'Code', kind: 'text', required: true, hint: 'Letters, digits, underscores.' },
    { name: 'label', label: 'Label', kind: 'text', required: true }, { name: 'active', label: 'Active', kind: 'bool' },
  ],
};
