export const SHIPMENT_STATUSES = [
  'Planned', 'Ready to Pack', 'Packing', 'Verified', 'Shipped', 'On Hold', 'Rework', 'Cancelled',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface FieldError { fieldId: string; message: string }
export interface Crumb { label: string; href?: string }
