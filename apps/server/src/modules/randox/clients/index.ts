import { randoxTransport } from '../config.js';
import { LiveNexusLabClient } from './NexusLabClient.js';
import { LiveClinicBookingClient } from './ClinicBookingClient.js';
import { MockNexusLabClient } from '../mock/MockNexusLabClient.js';
import { MockClinicBookingClient } from '../mock/MockClinicBookingClient.js';
import type { NexusLabClient, ClinicBookingClient } from './types.js';

/**
 * The mock↔live swap, in one place. Everything else in the integration
 * takes the interface and never knows which implementation it has, so
 * going live is RANDOX_TRANSPORT=live and nothing else.
 *
 * Clients are built lazily and then held: constructing the live ones reads
 * connection config, which must not happen at import time in a process
 * where Randox is switched off entirely.
 */

let nexus: NexusLabClient | null = null;
let booking: ClinicBookingClient | null = null;

export function nexusLabClient(): NexusLabClient {
  if (!nexus) {
    nexus = randoxTransport() === 'mock' ? new MockNexusLabClient() : new LiveNexusLabClient();
  }
  return nexus;
}

export function clinicBookingClient(): ClinicBookingClient {
  if (!booking) {
    booking = randoxTransport() === 'mock' ? new MockClinicBookingClient() : new LiveClinicBookingClient();
  }
  return booking;
}

/** Tests only — inject doubles, or force a rebuild after changing config. */
export function __setRandoxClientsForTest(
  nexusClient: NexusLabClient | null,
  bookingClient: ClinicBookingClient | null,
): void {
  nexus = nexusClient;
  booking = bookingClient;
}

export type { NexusLabClient, ClinicBookingClient } from './types.js';
