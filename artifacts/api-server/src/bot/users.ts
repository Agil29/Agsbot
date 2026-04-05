export type UserProfile = {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  uid: number;
  regDate: Date;
  saldo: number;
};

const users = new Map<number, UserProfile>();
let uidCounter = 1000;

export function getOrRegisterUser(
  telegramId: number,
  firstName: string,
  lastName?: string,
  username?: string
): UserProfile {
  if (users.has(telegramId)) {
    const user = users.get(telegramId)!;
    user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (username !== undefined) user.username = username;
    return user;
  }

  uidCounter += Math.floor(Math.random() * 50) + 1;
  const newUser: UserProfile = {
    telegramId,
    firstName,
    lastName,
    username,
    uid: uidCounter,
    regDate: new Date(),
    saldo: 0,
  };
  users.set(telegramId, newUser);
  return newUser;
}

export function getUser(telegramId: number): UserProfile | undefined {
  return users.get(telegramId);
}

export function updateSaldo(telegramId: number, amount: number): UserProfile | null {
  const user = users.get(telegramId);
  if (!user) return null;
  user.saldo += amount;
  return user;
}

export function getAllUsers(): UserProfile[] {
  return Array.from(users.values());
}

export function formatRegDate(date: Date): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
