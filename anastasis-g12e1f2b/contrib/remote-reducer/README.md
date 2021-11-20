# Anastasis Remote Reducer

The remote reducer is a simple HTTP service that proxies requests to
``anastasis-reducer``.  It is not meant to be used in production.

## Dependencies

The remote reducer needs python3 and flask.  Flask can be installed via pip:

```
pip3 install flask
```

## Running the remote reducer

```
cd $ANASTASIS_GIT/contrib/remote-reducer
export FLASK_APP=remote_reducer
flask run -p 5000
```
