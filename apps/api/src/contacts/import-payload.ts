export interface ContactInput {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  date?: string;
}

export interface FrequentContactInput {
  id?: string | number;
  category?: string;
  type?: string;
  name?: string;
  rating?: number;
}

type ContactsImportObject = {
  contacts?: {
    list?: ContactInput[];
  };
  frequent_contacts?: {
    list?: FrequentContactInput[];
  };
  list?: ContactInput[];
};

export type NormalizedImportPayload = {
  contacts: ContactInput[];
  frequentContacts: FrequentContactInput[];
};

export function normalizeContactsImportPayload(
  body: unknown,
): NormalizedImportPayload | null {
  if (Array.isArray(body)) {
    return { contacts: body as ContactInput[], frequentContacts: [] };
  }

  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const payload = body as ContactsImportObject;

  const contacts = Array.isArray(payload.contacts?.list)
    ? payload.contacts.list
    : Array.isArray(payload.list)
      ? payload.list
      : [];

  const frequentContacts = Array.isArray(payload.frequent_contacts?.list)
    ? payload.frequent_contacts.list
    : [];

  if (contacts.length === 0 && frequentContacts.length === 0) {
    return null;
  }

  return {
    contacts,
    frequentContacts,
  };
}
