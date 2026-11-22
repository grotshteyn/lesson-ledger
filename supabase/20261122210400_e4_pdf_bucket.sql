-- Private invoice PDF bucket; only trusted Edge Function service role writes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('invoice-pdfs','invoice-pdfs',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false,
  file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
