-- Fix bot_content_items post_id foreign key to allow cascade on delete
ALTER TABLE "bot_content_items" DROP CONSTRAINT IF EXISTS "bot_content_items_post_id_posts_id_fk";
ALTER TABLE "bot_content_items" ADD CONSTRAINT "bot_content_items_post_id_posts_id_fk" 
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL;
