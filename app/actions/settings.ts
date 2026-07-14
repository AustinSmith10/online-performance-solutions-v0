"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { setDigestSchedule, isValidTime } from "@/lib/settings/digest-schedule";
import { setBusinessHours } from "@/lib/settings/business-hours";
import { setDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import type { DeliveryDelayDurations } from "@/lib/delivery/delivery-delay";
import {
  setAdminNavRestrictions,
  RESTRICTABLE_NAV_ITEMS,
  type AdminNavKey,
} from "@/lib/settings/admin-nav-restrictions";

const DigestScheduleSchema = z.object({
  morning: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
  afternoon: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
});

export type UpdateDigestScheduleState = {
  saved?: boolean;
  errors?: {
    morning?: string[];
    afternoon?: string[];
    form?: string[];
  };
};

export async function updateDigestScheduleAction(
  _prev: UpdateDigestScheduleState,
  formData: FormData
): Promise<UpdateDigestScheduleState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = DigestScheduleSchema.safeParse({
    morning: formData.get("morning"),
    afternoon: formData.get("afternoon"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await setDigestSchedule(supabase, validated.data, actor.id as string);

  if (error) return { errors: { form: [error] } };

  await auditLog("settings.digest_schedule_updated", actor.id as string, actor.email as string, {
    metadata: validated.data,
  });

  return { saved: true };
}

const BusinessHoursSchema = z.object({
  start: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
  end: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
});

export type UpdateBusinessHoursState = {
  saved?: boolean;
  errors?: {
    start?: string[];
    end?: string[];
    form?: string[];
  };
};

export async function updateBusinessHoursAction(
  _prev: UpdateBusinessHoursState,
  formData: FormData
): Promise<UpdateBusinessHoursState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = BusinessHoursSchema.safeParse({
    start: formData.get("start"),
    end: formData.get("end"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await setBusinessHours(supabase, validated.data, actor.id as string);

  if (error) return { errors: { form: [error] } };

  await auditLog("settings.business_hours_updated", actor.id as string, actor.email as string, {
    metadata: validated.data,
  });

  return { saved: true };
}

const DelayUnitSchema = z.enum(["hours", "workingDays"]);

const DeliveryDelayDurationsSchema = z.object({
  normalUnit: DelayUnitSchema,
  normalValue: z.coerce.number({ error: "Enter a number" }).positive(),
  extendedUnit: DelayUnitSchema,
  extendedValue: z.coerce.number({ error: "Enter a number" }).positive(),
});

export type UpdateDeliveryDelayDurationsState = {
  saved?: boolean;
  errors?: {
    normalValue?: string[];
    extendedValue?: string[];
    form?: string[];
  };
};

export async function updateDeliveryDelayDurationsAction(
  _prev: UpdateDeliveryDelayDurationsState,
  formData: FormData
): Promise<UpdateDeliveryDelayDurationsState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = DeliveryDelayDurationsSchema.safeParse({
    normalUnit: formData.get("normalUnit"),
    normalValue: formData.get("normalValue"),
    extendedUnit: formData.get("extendedUnit"),
    extendedValue: formData.get("extendedValue"),
  });

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors;
    return {
      errors: {
        normalValue: fieldErrors.normalValue ?? fieldErrors.normalUnit,
        extendedValue: fieldErrors.extendedValue ?? fieldErrors.extendedUnit,
      },
    };
  }

  const durations: DeliveryDelayDurations = {
    normal: { unit: validated.data.normalUnit, value: validated.data.normalValue },
    extended: { unit: validated.data.extendedUnit, value: validated.data.extendedValue },
  };

  const supabase = createAdminClient();
  const { error } = await setDeliveryDelayDurations(supabase, durations, actor.id as string);

  if (error) return { errors: { form: [error] } };

  await auditLog(
    "settings.delivery_delay_durations_updated",
    actor.id as string,
    actor.email as string,
    { metadata: validated.data }
  );

  return { saved: true };
}

const NAV_KEY_ENUM = RESTRICTABLE_NAV_ITEMS.map((item) => item.key) as [AdminNavKey, ...AdminNavKey[]];

const AdminNavRestrictionsSchema = z.object({
  restricted: z.array(z.enum(NAV_KEY_ENUM)),
});

export type UpdateAdminNavRestrictionsState = {
  saved?: boolean;
  errors?: { form?: string[] };
};

export async function updateAdminNavRestrictionsAction(
  _prev: UpdateAdminNavRestrictionsState,
  formData: FormData
): Promise<UpdateAdminNavRestrictionsState> {
  const actor = await requireRole("super_admin");

  const validated = AdminNavRestrictionsSchema.safeParse({
    restricted: formData.getAll("restricted"),
  });

  if (!validated.success) {
    return { errors: { form: ["Invalid selection."] } };
  }

  const supabase = createAdminClient();
  const { error } = await setAdminNavRestrictions(
    supabase,
    validated.data.restricted,
    actor.id as string
  );

  if (error) return { errors: { form: [error] } };

  await auditLog(
    "settings.admin_nav_restrictions_updated",
    actor.id as string,
    actor.email as string,
    { metadata: { restricted: validated.data.restricted } }
  );

  return { saved: true };
}
