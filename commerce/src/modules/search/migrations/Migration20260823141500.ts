import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Bounded edit distance for search.
 *
 * `fuzzystrmatch` supplies `levenshtein_less_equal`, which is what decides that `makbook`
 * is `macbook`. Trigram similarity alone could not: a single substitution in the middle of
 * a seven-letter word destroys most of its trigrams, so any threshold loose enough to
 * catch it also matches unrelated products.
 */
export class Migration20260823141500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create extension if not exists fuzzystrmatch;`);
  }

  override async down(): Promise<void> {
    // Left in place deliberately: dropping a shared extension on a rollback has a much
    // larger blast radius than the feature that introduced it.
  }
}
