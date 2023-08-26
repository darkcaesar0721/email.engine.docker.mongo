export interface Item {
  provider: string;
  ip: string;
  note?: string;
}

export abstract class AbstractList {
  public abstract add(item: Item, ttlInSeconds?: number, callback?: () => void): Promise<void>;
  public abstract remove(item: Item): Promise<void>;
  public abstract contains(item: Item): Promise<boolean>;
}