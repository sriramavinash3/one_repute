export interface AuthUser {
  uid: string;
  email: string;
  role: string;
  customerId: string | null;
  assignedOutletIds: string[];
}
