FROM nginx:alpine

# Remove the default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static application files
COPY index.html  /usr/share/nginx/html/
COPY style.css   /usr/share/nginx/html/
COPY app.js      /usr/share/nginx/html/

EXPOSE 80
