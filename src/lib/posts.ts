export async function deletePost(postId: string, requestingUser: User): Promise<void> {
  const post = await db.posts.findById(postId);
  if (!post) {
    throw new NotFoundError("Post not found");
  }

  await db.posts.delete(postId);
  await auditLog.record("post.deleted", { postId, deletedBy: requestingUser.id });
}
