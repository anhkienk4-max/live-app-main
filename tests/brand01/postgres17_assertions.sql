do $brand01$
declare
  product_id text;
  sku_id text;
  knowledge_id text;
  scheme_id text;
  multi_product_id text;
  multi_sku_id text;
  knowledge2_id text;
  row_count integer;
begin
  perform set_config('brand01.actor','admin-a',true);
  perform public.storage_resource_registry_create(
    '{"provider":"google_drive","canonical_id":"scoped-image","canonical_url":"https://drive.google.com/drive/folders/scoped-image","title":"Synthetic image","resource_type":"image","owner_id":"admin-a","visibility":"admin_only"}'::jsonb,
    '{"brand_id":"brand-a"}'::jsonb
  );
  perform public.storage_resource_registry_create(
    '{"provider":"google_drive","canonical_id":"private-attendance","canonical_url":"https://drive.google.com/drive/folders/private-attendance","title":"Private Attendance","resource_type":"attendance_evidence","owner_id":"member-a","visibility":"owner_only"}'::jsonb,
    null
  );
  product_id := (public.brand01_admin_create_product('P-A','Product A',null,'Internal','admin-a',array['brand-a'])).id;
  if product_id is null then raise exception 'BRAND01_PRODUCT_CREATE_FAILED'; end if;
  product_id := (public.brand01_admin_update_product(product_id,1,'P-A','Product A',null,'Internal','active',array['brand-a'])).id;
  sku_id := (public.brand01_admin_create_sku(product_id,'SKU-A','Variant A','100ml',null,'[{"platform_id":"platform-a","external_sku_id":"EXT-A"}]'::jsonb)).id;
  insert into public.brand01_campaign_product_skus(campaign_id,sku_id,owner_id,created_by) values ('campaign-a',sku_id,'admin-a','admin-a');
  insert into public.brand01_product_resource_links(resource_id,product_id,relation_type,owner_id,created_by)
    select id,product_id,'image','admin-a','admin-a' from public.storage_resources where canonical_id='scoped-image';
  perform public.storage_resource_registry_create(
    '{"provider":"google_drive","canonical_id":"brand-b-image","canonical_url":"https://drive.google.com/drive/folders/brand-b-image","title":"Brand B image","resource_type":"image","owner_id":"admin-a","visibility":"admin_only"}'::jsonb,
    '{"brand_id":"brand-b"}'::jsonb
  );
  multi_product_id := (public.brand01_admin_create_product('P-MULTI','Multi-brand Product',null,'Internal','admin-a',array['brand-a','brand-b'])).id;
  multi_sku_id := (public.brand01_admin_create_sku(multi_product_id,'SKU-MULTI','Variant','box',null,'[]'::jsonb)).id;
  insert into public.brand01_product_resource_links(resource_id,sku_id,relation_type,owner_id,created_by)
    select id,multi_sku_id,'image','admin-a','admin-a' from public.storage_resources where canonical_id='brand-b-image';
  knowledge_id := (public.brand01_admin_create_knowledge_version(product_id,null,'claim','{"text":"synthetic approved fact"}'::jsonb,null,null,'verified source record',current_date,null)).id;
  knowledge2_id := (public.brand01_admin_create_knowledge_version(product_id,null,'claim','{"text":"next synthetic fact version"}'::jsonb,null,null,'verified source record',current_date,null)).id;
  select version into row_count from public.brand01_product_knowledge_versions where id=knowledge2_id;
  if row_count<>2 then raise exception 'BRAND01_KNOWLEDGE_VERSION_ALLOCATION_FAILED'; end if;
  select count(*) into row_count from public.brand01_catalog_audit_events;
  if row_count<1 then raise exception 'BRAND01_ADMIN_AUDIT_MISSING'; end if;

  begin
    perform public.storage_resource_registry_create(
      '{"provider":"google_drive","canonical_id":"invalid-attendance","canonical_url":"https://drive.google.com/drive/folders/invalid-attendance","title":"Invalid","resource_type":"attendance_evidence","owner_id":"admin-a","visibility":"admin_only"}'::jsonb,
      '{"brand_id":"brand-a"}'::jsonb
    );
    raise exception 'EXPECTED_ATTENDANCE_LINK_REJECTION';
  exception when check_violation then null; end;
  begin
    insert into public.brand01_campaign_product_skus(campaign_id,sku_id,owner_id,created_by) values ('campaign-b',sku_id,'admin-a','admin-a');
    raise exception 'EXPECTED_CROSS_BRAND_SKU_REJECTION';
  exception when check_violation then null; end;
  begin
    perform public.brand01_admin_create_product('P-BAD','Invalid Product',null,null,'admin-a',array['missing-brand']);
    raise exception 'EXPECTED_INVALID_BRAND_ROLLBACK';
  exception when foreign_key_violation then null; end;
  select count(*) into row_count from public.brand01_products where product_code='P-BAD';
  if row_count<>0 then raise exception 'BRAND01_ATOMIC_CREATE_ROLLBACK_FAILED'; end if;
  begin
    insert into public.brand01_product_resource_links(resource_id,sku_id,relation_type,owner_id,created_by)
      select id,sku_id,'image','admin-a','admin-a' from public.storage_resources where canonical_id='brand-b-image';
    raise exception 'EXPECTED_BRAND_MISMATCH_REJECTION';
  exception when check_violation then null; end;
  begin
    perform public.brand01_admin_update_product(product_id,99,'P-A','Product A',null,null,'active',array['brand-a']);
    raise exception 'EXPECTED_VERSION_CONFLICT';
  exception when serialization_failure then null; end;
  begin
    insert into public.brand01_knowledge_reviews(knowledge_version_id,decision,reviewer_id,reason) values(knowledge_id,'approved','admin-a','self review');
    raise exception 'EXPECTED_SELF_REVIEW_REJECTION';
  exception when insufficient_privilege then null; end;
  insert into public.brand01_campaign_schemes(campaign_id,scheme_name,terms,valid_from,valid_to,owner_id,status,source_url,created_by,updated_by)
    values('campaign-a','Synthetic Scheme','Synthetic terms',statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 day','admin-a','draft','https://example.test/scheme','admin-a','admin-a') returning id into scheme_id;
  perform set_config('brand01.actor','admin-b',true);
  insert into public.brand01_knowledge_reviews(knowledge_version_id,decision,reviewer_id,reason) values(knowledge_id,'approved','admin-b','Independent source review');
  perform public.brand01_admin_review_campaign_scheme(scheme_id,'approved');
  perform public.brand01_admin_set_brand_access('leader-a','brand-a',true,null);
  perform public.brand01_admin_set_brand_access('member-a','brand-a',true,null);
  perform public.brand01_admin_set_brand_access('member-b','brand-b',true,null);
  begin
    perform public.brand01_admin_set_brand_access('member-b','brand-a',true,statement_timestamp()-interval '1 day');
    raise exception 'EXPECTED_EXPIRED_SCOPE_REJECTION';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.brand01_product_resource_links(resource_id,product_id,relation_type,owner_id,created_by)
      select id,product_id,'document','admin-b','admin-b' from public.storage_resources where canonical_id='private-attendance';
    raise exception 'EXPECTED_PRIVATE_ATTENDANCE_LINK_REJECTION';
  exception when check_violation then null; end;
  perform set_config('brand01.actor','leader-a',true);
  select count(*) into row_count from public.brand01_products where id=product_id;
  if row_count<>1 then raise exception 'BRAND01_SCOPED_LEADER_READ_FAILED'; end if;
  select count(*) into row_count from public.brand01_product_knowledge_versions where id=knowledge_id;
  if row_count<>1 then raise exception 'BRAND01_APPROVED_KNOWLEDGE_READ_FAILED'; end if;
  select count(*) into row_count from public.brand01_product_resource_links;
  if row_count<>0 then raise exception 'BRAND01_RESOURCE_LINK_BYPASSED_STO02_VISIBILITY'; end if;
  select count(*) into row_count from public.brand01_catalog_audit_events;
  if row_count<>0 then raise exception 'BRAND01_AUDIT_METADATA_LEAKED_TO_LEADER'; end if;
  begin
    insert into public.brand01_products(product_code,name,lifecycle_status,owner_id,created_by,updated_by)
      values('FORGED','Forged Product','active','admin-a','admin-a','admin-a');
    raise exception 'EXPECTED_MEMBER_PRODUCT_WRITE_DENIAL';
  exception when insufficient_privilege then null; end;
  begin
    perform public.brand01_admin_set_brand_access('member-b','brand-a',true,null);
    raise exception 'EXPECTED_NON_ADMIN_SCOPE_GRANT_DENIAL';
  exception when insufficient_privilege then null; end;
  perform set_config('brand01.actor','member-a',true);
  select count(*) into row_count from public.brand01_products where id=product_id;
  if row_count<>1 then raise exception 'BRAND01_SCOPED_MEMBER_READ_FAILED'; end if;
  select count(*) into row_count from public.brand01_campaign_schemes where id=scheme_id;
  if row_count<>1 then raise exception 'BRAND01_APPROVED_SCHEME_READ_FAILED'; end if;
  select count(*) into row_count from public.brand01_catalog_audit_events;
  if row_count<>0 then raise exception 'BRAND01_AUDIT_METADATA_LEAKED_TO_MEMBER'; end if;
  begin
    insert into public.brand01_user_brand_access(user_id,brand_id,access_level,granted_by)
      values('member-b','brand-b','read','member-a');
    raise exception 'EXPECTED_MEMBER_ACCESS_WRITE_DENIAL';
  exception when insufficient_privilege then null; end;
  perform set_config('brand01.actor','member-b',true);
  select count(*) into row_count from public.brand01_products;
  if row_count<>0 then raise exception 'BRAND01_CROSS_BRAND_READ_LEAK'; end if;
  select count(*) into row_count from public.brand01_campaign_product_skus;
  if row_count<>0 then raise exception 'BRAND01_CROSS_BRAND_CAMPAIGN_LEAK'; end if;
  select count(*) into row_count from public.brand01_product_knowledge_versions;
  if row_count<>0 then raise exception 'BRAND01_EXPIRED_SCOPE_KNOWLEDGE_LEAK'; end if;
end
$brand01$;
